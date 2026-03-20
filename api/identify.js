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

  const prompt = `You are a California fishing regulations expert and marine biologist.
Look at this photo carefully and answer the following questions.
Reply with ONLY these exact fields, one per line, no markdown, no JSON, no extra text:

IS_FISH: yes or no (is this a fish, crab, shellfish, or other marine/freshwater creature that could be caught fishing?)
COMMON_NAME: (common name, e.g. "Dungeness Crab" — leave blank if not a catchable species)
SCIENTIFIC_NAME: (latin name, e.g. "Metacarcinus magister" — leave blank if unknown)
CONFIDENCE: high or medium or low
CONFIDENCE_REASON: (one sentence explaining your confidence level)
IMAGE_QUALITY: good or poor (is the image clear enough to identify reliably?)
CALIFORNIA_LEGAL_STATUS: legal or check or protected or closed or unknown
LEGAL_NOTE: (one sentence about legal status in California waters)
BAG_LIMIT: (number or "no limit" or "no take" or blank if unknown)
MIN_SIZE: (e.g. "5.75 inches" or blank if unknown)
SEASON: (e.g. "Year-round" or "Nov 1 – Jun 30" or blank if unknown)
GEAR: (allowed gear or blank if unknown)
ID_TIPS: (2-3 key identification features that distinguish this species)
LOOK_ALIKES: (similar species to watch out for, or "none")`;

  try {
    // Run identification — twice if low confidence or poor image quality
    const runGemini = async () => {
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
            generationConfig: { temperature: 0.1, maxOutputTokens: 700 }
          })
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini error ${res.status}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    };

    const parse = (text) => {
      const get = (key) => {
        const line = text.split('\n').find(l => l.startsWith(key + ':'));
        return line ? line.substring(key.length + 1).trim() : '';
      };
      return {
        isFish:           get('IS_FISH').toLowerCase() === 'yes',
        commonName:       get('COMMON_NAME'),
        scientificName:   get('SCIENTIFIC_NAME'),
        confidence:       get('CONFIDENCE').toLowerCase() || 'medium',
        confidenceReason: get('CONFIDENCE_REASON'),
        imageQuality:     get('IMAGE_QUALITY').toLowerCase() || 'good',
        legalStatus:      get('CALIFORNIA_LEGAL_STATUS').toLowerCase() || 'check',
        legalStatusNote:  get('LEGAL_NOTE'),
        bagLimit:         get('BAG_LIMIT'),
        minSize:          get('MIN_SIZE'),
        season:           get('SEASON'),
        gearAllowed:      get('GEAR'),
        identificationTips: get('ID_TIPS'),
        lookAlikes:       get('LOOK_ALIKES'),
      };
    };

    // First pass
    const text1 = await runGemini();
    const r1 = parse(text1);

    // Guard: not a catchable species
    if (!r1.isFish) {
      return new Response(JSON.stringify({
        error: 'not_a_fish',
        message: 'No fish, crab, or shellfish detected in this photo. Try a clearer photo of your catch.'
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    // Guard: unusable image
    if (r1.imageQuality === 'poor' && r1.confidence === 'low') {
      return new Response(JSON.stringify({
        error: 'poor_image',
        message: 'Image quality is too low for reliable identification. Try a clearer, well-lit photo.'
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    // Auto double-check: run again if low confidence or poor image quality
    let result = r1;
    let doubleChecked = false;

    if (r1.confidence === 'low' || r1.imageQuality === 'poor') {
      const text2 = await runGemini();
      const r2 = parse(text2);
      doubleChecked = true;

      if (r1.commonName && r2.commonName &&
          r1.commonName.toLowerCase() === r2.commonName.toLowerCase()) {
        // Both runs agree — bump confidence to medium
        result = { ...r1, confidence: 'medium', doubleChecked: true,
          confidenceReason: r1.confidenceReason + ' (Confirmed by second analysis.)' };
      } else if (r2.confidence === 'high') {
        // Second run more confident — use it
        result = { ...r2, doubleChecked: true };
      } else {
        // Both runs disagree — keep low, note the discrepancy
        result = {
          ...r1,
          confidence: 'low',
          doubleChecked: true,
          confidenceReason: `Two analyses gave different results: "${r1.commonName}" vs "${r2.commonName}". Verify carefully.`,
          alternateId: r2.commonName,
        };
      }
    }

    if (!result.commonName) {
      return new Response(JSON.stringify({
        error: 'not_identified',
        message: 'Could not identify the species in this photo. Try a clearer photo with the full fish visible.'
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ...result, doubleChecked }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
