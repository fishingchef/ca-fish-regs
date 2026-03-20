// middleware.js
// ============================================================
// Fish Smarter — API Rate Limiting (Vercel Edge Middleware)
// No Next.js required — uses Web standard Request/Response
// ============================================================
// Rate limits:
//   /api/identify → 5 req/min per IP  (Gemini protection)
//   /api/*        → 60 req/min per IP (general)
// ============================================================

const rateStore = new Map();

const LIMITS = {
  '/api/identify': [5,  60_000],
  '/api/':         [60, 60_000],
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

  if (!pathname.startsWith('/api/')) {
    return new Response(null, { status: 200 });
  }

  const ip = getClientIP(req);
  const limitEntry = Object.entries(LIMITS).find(([path]) => pathname.startsWith(path));
  if (!limitEntry) return new Response(null, { status: 200 });

  const [limitPath, [maxRequests, windowMs]] = limitEntry;
  const result = checkRateLimit(`${ip}:${limitPath}`, maxRequests, windowMs);

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

  return new Response(null, {
    status: 200,
    headers: {
      'X-RateLimit-Limit': String(maxRequests),
      'X-RateLimit-Remaining': String(result.remaining),
    },
  });
}

export const config = {
  matcher: '/api/:path*',
};
