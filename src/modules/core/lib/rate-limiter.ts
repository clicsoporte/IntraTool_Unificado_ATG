/**
 * @fileoverview In-memory and SQLite backed rate limiter for sensitive authentication endpoints.
 */

interface RateLimitRecord {
  attempts: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

/**
 * Checks if a specific key (IP address or username) is allowed to perform an action.
 * @param key Identifier (e.g. `login:192.168.1.1` or `login:admin`)
 * @param maxAttempts Maximum allowed failed attempts before lockout (default: 10)
 * @param windowMs Time window in milliseconds (default: 15 minutes)
 * @returns Object with allowed status, remaining attempts, and retryAfter seconds.
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number = 10,
  windowMs: number = 15 * 60 * 1000
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || now > record.resetAt) {
    return {
      allowed: true,
      remaining: maxAttempts,
      retryAfterSec: 0,
    };
  }

  if (record.attempts >= maxAttempts) {
    const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
    };
  }

  return {
    allowed: true,
    remaining: maxAttempts - record.attempts,
    retryAfterSec: 0,
  };
}

/**
 * Records a failed attempt for a given key.
 */
export function recordRateLimitFailure(
  key: string,
  windowMs: number = 15 * 60 * 1000
): void {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || now > record.resetAt) {
    memoryStore.set(key, {
      attempts: 1,
      resetAt: now + windowMs,
    });
  } else {
    record.attempts += 1;
  }
}

/**
 * Resets the rate limit upon a successful action/login.
 */
export function resetRateLimit(key: string): void {
  memoryStore.delete(key);
}
