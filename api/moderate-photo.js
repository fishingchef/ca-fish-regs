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

  const prompt = `You are a content moderation system for a fishing app.
Analyze this image and determine if it is safe to publish on a family-friendly fishing platform.

Reply with ONLY these exact fields, one per line, no markdown, no JSON, no extra text:

SAFE: yes or no
REASON: (one sentence — only if not safe, otherwise leave blank)
CATEGORY: fishing_content or other_content or unsafe_content`;

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: imageType, data: imageBase64 } },
            { text: prompt }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_LOW_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_LOW_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
          ]
        })
      }
    );

    // If Gemini itself blocked the image due to safety settings — reject it
    if (res.status === 400) {
      return new Response(JSON.stringify({
        safe: false,
        reason: 'This image was flagged by our content filter. Please use a photo of your catch.'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!res.ok) {
      // On API error, fail open — don't block the user
      return new Response(JSON.stringify({ safe: true, reason: '' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await res.json();

    // If Gemini returned no candidates (blocked by safety filters)
    if (!data.candidates || !data.candidates.length) {
      return new Response(JSON.stringify({
        safe: false,
        reason: 'This image was flagged by our content filter. Please use a photo of your catch.'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const text = data.candidates[0]?.content?.parts?.[0]?.text || '';

    const get = (key) => {
      const line = text.split('\n').find(l => l.startsWith(key + ':'));
      return line ? line.substring(key.length + 1).trim() : '';
    };

    const safe     = get('SAFE').toLowerCase() === 'yes';
    const reason   = get('REASON');
    const category = get('CATEGORY');

    return new Response(JSON.stringify({ safe, reason, category }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    // On any error, fail open so a network hiccup doesn't block users
    return new Response(JSON.stringify({ safe: true, reason: '' }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  }
}
