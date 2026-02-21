/**
 * Simple in-memory rate limiter for API routes.
 * Uses sliding window algorithm per IP.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key);
    }
  }
}, 60_000); // Clean every minute

export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Check if request should be rate limited.
 * @param key Unique identifier (usually IP address)
 * @param config Rate limit configuration
 * @returns Result with success status and remaining requests
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  // No entry or expired window
  if (!entry || entry.resetTime < now) {
    store.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs,
    };
  }

  // Within window, check limit
  if (entry.count >= config.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }

  // Increment count
  entry.count++;
  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Get client IP from request headers.
 * Handles common proxy headers.
 */
export function getClientIP(request: Request): string {
  // Check common proxy headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }
  
  // Fallback (may not work in all environments)
  return "unknown";
}

// Pre-configured rate limits
export const RATE_LIMITS = {
  // Public API routes - generous limits
  public: { windowMs: 60_000, maxRequests: 60 },  // 60 req/min
  // Stock API - more restrictive (external API calls)
  stock: { windowMs: 60_000, maxRequests: 30 },   // 30 req/min
  // Admin routes - less restrictive
  admin: { windowMs: 60_000, maxRequests: 120 },  // 120 req/min
};
