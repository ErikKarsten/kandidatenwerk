import { getCloudflareContext } from "@opennextjs/cloudflare"

// Login-Rate-Limiting über die Cloudflare-Workers-Rate-Limiting-Bindings
// (wrangler.jsonc "ratelimits"). Ersetzt am 02.10.2026 den bisherigen In-Memory-Zähler,
// der auf Cloudflare praktisch wirkungslos war: jede Worker-Instanz hatte ihren eigenen
// Speicher, ein Angreifer landete bei jedem Versuch potenziell auf einer frischen.
//
// Cloudflare erlaubt nur Zeitfenster von 10 oder 60 Sekunden, daher zwei Grenzen pro
// Minute: je E-Mail-Adresse (gegen Passwort-Durchprobieren für ein Konto) und je IP
// (gegen das Abklappern vieler Konten). Die Zählung ist pro Cloudflare-Standort und
// leicht verzögert konsistent - als Bremse gedacht, nicht als exakte Quote.

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

interface RateLimitEnv {
  LOGIN_LIMIT_EMAIL?: RateLimiter
  LOGIN_LIMIT_IP?: RateLimiter
}

export async function checkLoginRateLimit(email: string, ip: string | null): Promise<boolean> {
  const env = getCloudflareContext().env as unknown as RateLimitEnv

  if (!env.LOGIN_LIMIT_EMAIL || !env.LOGIN_LIMIT_IP) {
    // Ohne Binding (z.B. lokaler Start ohne wrangler-Konfiguration) nicht den Login
    // blockieren, aber laut melden - auf Cloudflare sind beide Bindings konfiguriert.
    console.warn("[ratelimit] Rate-Limiting-Bindings fehlen - Login wird nicht begrenzt.")
    return true
  }

  const checks = [env.LOGIN_LIMIT_EMAIL.limit({ key: `email:${email.trim().toLowerCase()}` })]
  if (ip) checks.push(env.LOGIN_LIMIT_IP.limit({ key: `ip:${ip}` }))

  const outcomes = await Promise.all(checks)
  return outcomes.every((o) => o.success)
}
