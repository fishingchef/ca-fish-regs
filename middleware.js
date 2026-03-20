// middleware.js
// Fish Smarter — API Rate Limiting (Vercel Edge)
// Uses Web standard Request/Response — no Next.js required

const rateStore = new Map();

const LIMITS = {
  '/api/identify': [5,  60_000],   // 5 per minute — Gemini protection
  '/api/':         [60, 60_000],   // 60 per minute — general API
};

function getClientIP(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const timestamps = (rateStore.get(key) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }
  timestamps.push(now);
  rateStore.set(key, timestamps);
  return { allowed: true, remaining: maxRequests - timestamps.length };
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, timestamps] of rateStore.entries()) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) rateStore.delete(key);
    else rateStore.set(key, fresh);
  }
}, 300_000);

export default function middleware(req) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Only apply rate limiting to API routes
  if (!pathname.startsWith('/api/')) {
    return; // returning undefined = pass through
  }

  const ip = getClientIP(req);
  const limitEntry = Object.entries(LIMITS).find(([path]) => pathname.startsWith(path));

  // No matching limit — pass through
  if (!limitEntry) return;

  const [limitPath, [maxRequests, windowMs]] = limitEntry;
  const result = checkRateLimit(`${ip}:${limitPath}`, maxRequests, windowMs);

  // Rate limited — block with 429
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // Allowed — return undefined to pass through to the actual API function
  return;
}

export const config = {
  matcher: '/api/:path*',
};
