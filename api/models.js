export const config = { runtime: 'edge' };

export default async function handler(req) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No API key' }), { status: 500 });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  const data = await res.json();
  // Return just the model names that support generateContent
  const models = (data.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name);
  return new Response(JSON.stringify({ models }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
