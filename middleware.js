// middleware.js
// ============================================================
// Fish Smarter — API Rate Limiting
// Place this file at the ROOT of your repo (same level as
// package.json and vercel.json). Vercel runs it automatically
// on every request before it hits your API functions.
// ============================================================
// Rate limits enforced:
//   /api/identify  → 5 requests per minute per IP  (Gemini)
//   /api/*         → 60 requests per minute per IP (general)
// ============================================================

import { NextResponse } from 'next/server';

// In-memory store — resets on each cold start (fine for rate limiting)
// At scale, swap this for Vercel KV (Redis) — one-line change
const rateStore = new Map();

// Config: [maxRequests, windowMs]
const LIMITS = {
  '/api/identify': [5,  60_000],   // 5 per minute — Gemini is expensive
  '/api/':         [60, 60_000],   // 60 per minute — general API
};

function getClientIP(req) {
  // Vercel sets x-forwarded-for reliably
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const timestamps = (rateStore.get(key) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    // Return seconds until oldest request expires
    const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }
  timestamps.push(now);
  rateStore.set(key, timestamps);
  return { allowed: true, remaining: maxRequests - timestamps.length };
}

// Clean up old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, timestamps] of rateStore.entries()) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) rateStore.delete(key);
    else rateStore.set(key, fresh);
  }
}, 300_000);

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const ip = getClientIP(request);

  // Find the most specific matching limit
  const limitEntry = Object.entries(LIMITS).find(([path]) => pathname.startsWith(path));
  if (!limitEntry) return NextResponse.next();

  const [limitPath, [maxRequests, windowMs]] = limitEntry;
  const storeKey = `${ip}:${limitPath}`;
  const result = checkRateLimit(storeKey, maxRequests, windowMs);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((Date.now() + result.retryAfter * 1000) / 1000)),
        },
      }
    );
  }

  // Pass through with rate limit headers so client can see its usage
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(maxRequests));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
