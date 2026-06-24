// Einfache In-Memory Rate Limiting (für Development)
// In Production: Upstash Redis verwenden!

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

export async function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 3600000 // 1 Stunde
): Promise<{ success: boolean; remaining: number; resetTime?: number }> {
  const now = Date.now();
  const key = `ratelimit:${identifier}`;

  if (!store[key]) {
    store[key] = { count: 1, resetTime: now + windowMs };
    return { success: true, remaining: maxAttempts - 1 };
  }

  const record = store[key];

  // Fenster abgelaufen?
  if (now > record.resetTime) {
    store[key] = { count: 1, resetTime: now + windowMs };
    return { success: true, remaining: maxAttempts - 1 };
  }

  // Limit überschritten?
  if (record.count >= maxAttempts) {
    return {
      success: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }

  // Erlaubt, aber Count erhöhen
  record.count++;
  return {
    success: true,
    remaining: maxAttempts - record.count,
  };
}
