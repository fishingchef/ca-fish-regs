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

  try {
    const { imageBase64, imageType } = await req.json();

    const prompt = `Identify the California fish, crab, or shellfish in this photo. Respond ONLY with this JSON, no other text:
{"commonName":"name","scientificName":"scientific name","confidence":"high|medium|low","confidenceReason":"brief reason","legalStatus":"legal|check|protected|closed","legalStatusNote":"one sentence","bagLimit":"e.g. 10 fish or CLOSED","minSize":"e.g. 22 inches or None","season":"e.g. Open year-round","gearAllowed":"e.g. Hook and line","identificationTips":"2-3 key features","lookAlikes":"similar species or null","tips":"1-2 fishing tips for California"}`;

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
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.error?.message || 'Gemini error' }), {
        status: geminiRes.status, headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return new Response(JSON.stringify({ error: 'No response' }), { status: 500 });

    let clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) clean = clean.substring(start, end + 1);

    const result = JSON.parse(clean);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
