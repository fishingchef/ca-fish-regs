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

  // Two separate prompts — first identify, then get regulations
  // This avoids long JSON that gets truncated
  const identifyPrompt = `What species of fish, crab, or shellfish is in this photo? 
Reply with ONLY these fields, each on its own line, no JSON, no markdown:
COMMON_NAME: 
SCIENTIFIC_NAME: 
CONFIDENCE: high or medium or low
CONFIDENCE_REASON: 
LEGAL_STATUS: legal or check or protected or closed
LEGAL_NOTE: 
BAG_LIMIT: 
MIN_SIZE: 
SEASON: 
GEAR: 
ID_TIPS: 
LOOK_ALIKES: 
TIPS: `;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: imageType, data: imageBase64 } },
            { text: identifyPrompt }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
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

    // Parse the line-by-line response into a clean object
    const getValue = (key) => {
      const line = text.split('\n').find(l => l.startsWith(key + ':'));
      return line ? line.substring(key.length + 1).trim() : '';
    };

    const result = {
      commonName:       getValue('COMMON_NAME'),
      scientificName:   getValue('SCIENTIFIC_NAME'),
      confidence:       getValue('CONFIDENCE').toLowerCase() || 'medium',
      confidenceReason: getValue('CONFIDENCE_REASON'),
      legalStatus:      getValue('LEGAL_STATUS').toLowerCase() || 'check',
      legalStatusNote:  getValue('LEGAL_NOTE'),
      bagLimit:         getValue('BAG_LIMIT'),
      minSize:          getValue('MIN_SIZE'),
      season:           getValue('SEASON'),
      gearAllowed:      getValue('GEAR'),
      identificationTips: getValue('ID_TIPS'),
      lookAlikes:       getValue('LOOK_ALIKES'),
      tips:             getValue('TIPS')
    };

    if (!result.commonName) {
      return new Response(JSON.stringify({ error: 'Could not identify species in this photo' }), { status: 422 });
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
