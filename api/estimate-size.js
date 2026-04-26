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

  const { imageBase64, imageType, speciesName } = await req.json().catch(() => ({}));
  if (!imageBase64 || !speciesName) {
    return new Response(JSON.stringify({ error: 'Missing image or species name' }), { status: 400 });
  }

  const prompt = `You are an expert fisheries biologist. Look at this photo of a ${speciesName}.
Estimate the weight and length of this fish based on its visible proportions, body depth, and any reference points in the image (hands, rod, net, cooler, etc).

Reply with ONLY these exact fields, one per line, no markdown, no JSON, no extra text:

WEIGHT_LOW: (lower bound in lbs, number only, e.g. 2.5)
WEIGHT_HIGH: (upper bound in lbs, number only, e.g. 4.0)
LENGTH_LOW: (lower bound in inches, number only, e.g. 16)
LENGTH_HIGH: (upper bound in inches, number only, e.g. 20)
CONFIDENCE: high or medium or low
REASON: (one sentence explaining your estimate — what reference points did you use?)
NOTABLE: (any notable features visible — coloring, condition, unusual size — or blank)`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: imageType, data: imageBase64 } },
            { text: prompt }
          ]}],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
        })
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini error ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const get = (key) => {
      const line = text.split('\n').find(l => l.startsWith(key + ':'));
      return line ? line.substring(key.length + 1).trim() : '';
    };

    const weightLow  = parseFloat(get('WEIGHT_LOW'));
    const weightHigh = parseFloat(get('WEIGHT_HIGH'));
    const lengthLow  = parseFloat(get('LENGTH_LOW'));
    const lengthHigh = parseFloat(get('LENGTH_HIGH'));

    // Validate we got sensible numbers
    if (isNaN(weightLow) || isNaN(lengthLow)) {
      return new Response(JSON.stringify({
        error: 'estimate_failed',
        message: 'Could not estimate size from this photo. Enter measurements manually.'
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      weightLow:  Math.round(weightLow  * 10) / 10,
      weightHigh: Math.round(weightHigh * 10) / 10,
      lengthLow:  Math.round(lengthLow),
      lengthHigh: Math.round(lengthHigh),
      confidence: get('CONFIDENCE').toLowerCase() || 'medium',
      reason:     get('REASON'),
      notable:    get('NOTABLE'),
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
