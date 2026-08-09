// Lightweight in-memory rate limiter (track 5c hardening).
//
// Fixed-window counter keyed by "<bucket>:<id>". This is PER-PROCESS — perfectly
// adequate for the single-instance deployment this app targets (<=10 users). If
// the app is ever scaled to multiple replicas, swap the Map for a shared store
// (Redis INCR + EXPIRE) behind the same checkRateLimit() signature.

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Keep the Map from growing unboundedly if many distinct keys appear. With a
// handful of users this never triggers, but it's cheap insurance.
const MAX_KEYS = 10_000;

function sweep(now: number) {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
};

export type RateLimitOptions = { limit: number; windowMs: number };

/**
 * Record one hit for (bucket, id) and report whether it is within the window's
 * allowance. Every call counts as a hit (including the one that trips the limit).
 */
export function checkRateLimit(
  bucket: string,
  id: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  if (store.size > MAX_KEYS) sweep(now);

  const key = `${bucket}:${id}`;
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return {
      ok: true,
      limit,
      remaining: limit - 1,
      retryAfterSec: Math.ceil(windowMs / 1000),
      resetAt: entry.resetAt,
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  return {
    ok: existing.count <= limit,
    limit,
    remaining,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    resetAt: existing.resetAt,
  };
}

/** Best-effort client IP from proxy headers (set by the reverse proxy in prod). */
export function getClientIp(req: Request | undefined): string {
  if (!req) return "unknown";
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Standard rate-limit headers for a result (attach to any Response). */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
  };
}

/** Build a 429 response with a friendly Azerbaijani message + Retry-After. */
export function tooManyRequests(r: RateLimitResult): Response {
  return new Response(
    "Çox sayda sorğu göndərildi. Bir azdan yenidən cəhd edin.",
    {
      status: 429,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": String(r.retryAfterSec),
        ...rateLimitHeaders(r),
      },
    },
  );
}
