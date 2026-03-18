export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { imageBase64, imageType } = req.body;

    if (!imageBase64 || !imageType) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageType,
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: `You are a California fishing regulations expert. Identify the fish, crab, shellfish, or marine animal in this photo and provide California-specific regulations.

Respond ONLY with a JSON object — no markdown, no backticks, no extra text:
{
  "commonName": "Common name of the species",
  "scientificName": "Scientific name",
  "confidence": "high|medium|low",
  "confidenceReason": "Brief reason for confidence level",
  "foundInCalifornia": true,
  "legalStatus": "legal|check|protected|closed|unknown",
  "legalStatusNote": "One sentence on legal status in CA",
  "bagLimit": "e.g. 10 fish, 2 crabs, No limit, or CLOSED",
  "minSize": "e.g. 22 inches, 5.75 inch carapace, or None",
  "season": "e.g. Open year-round or October through March",
  "gearAllowed": "e.g. Hook and line or Hoop nets and traps only",
  "identificationTips": "2-3 key visual features that confirm this ID",
  "lookAlikes": "Similar species to watch out for, or null",
  "tips": "1-2 practical fishing or harvesting tips for this species in California"
}`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      return res.status(response.status).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON from response
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    return res.status(200).json(result);

  } catch (e) {
    console.error('Fish ID error:', e);
    return res.status(500).json({ error: 'Failed to identify species: ' + e.message });
  }
}
