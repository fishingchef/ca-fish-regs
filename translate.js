export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not found', env_keys: Object.keys(process.env).filter(k => k.startsWith('ANTHROPIC') || k.startsWith('GEMINI')) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { lang, langName, fields } = await req.json().catch(() => ({}));
  if (!lang || !langName || !fields || typeof fields !== 'object') {
    return new Response(JSON.stringify({ error: 'Missing lang, langName, or fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Nothing to translate
  if (Object.keys(fields).length === 0) {
    return new Response(JSON.stringify({}), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }

  const prompt = `You are a fishing regulation translator. Translate the following fishing regulation fields into ${langName}.

Rules:
- Translate naturally as a native speaker would say it
- Keep scientific names in Latin exactly as-is (do not translate them)
- Keep numbers, measurements (inches, pounds, lbs), and dates exactly as-is
- Keep species names that have no direct translation — use the closest natural equivalent
- Do NOT translate URLs or legal citations like "CCR Title 14"
- Return ONLY a valid JSON object with the exact same keys as the input, nothing else — no markdown, no backticks, no explanation

Fields to translate:
${JSON.stringify(fields, null, 2)}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const translated = JSON.parse(clean);

    return new Response(JSON.stringify(translated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
