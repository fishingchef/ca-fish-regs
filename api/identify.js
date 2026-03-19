export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { imageBase64, imageType } = await req.json().catch(() => ({}));
  if (!imageBase64) {
    return new Response(JSON.stringify({ error: 'Missing image' }), { status: 400 });
  }

  const prompt = `You are a California fishing expert. Identify the species in this photo.

Return ONLY a JSON object. Keep all values SHORT (under 100 chars each). No markdown, no backticks:

{"commonName":"","scientificName":"","confidence":"high","confidenceReason":"","legalStatus":"legal","legalStatusNote":"","bagLimit":"","minSize":"","season":"","gearAllowed":"","identificationTips":"","lookAlikes":"","tips":""}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: imageType, data: imageBase64 } },
            { text: prompt }
          ]}],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 800,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.error?.message || `Error ${geminiRes.status}` }), {
        status: geminiRes.status, headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return new Response(JSON.stringify({ error: 'No response from AI' }), { status: 500 });

    // Robust JSON extraction
    let clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) clean = clean.substring(start, end + 1);

    const result = JSON.parse(clean);
    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
