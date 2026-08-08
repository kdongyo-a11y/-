/** MVP in-memory rate limit for public onboarding (serverless per-instance) */

const WINDOW_MS = 60 * 60 * 1000
const MAX_REQUESTS = 10

type Entry = { count: number; resetAt: number }

const buckets = new Map<string, Entry>()

export function checkOnboardingRateLimit(clientKey: string): { ok: true } | { ok: false } {
  const now = Date.now()
  const entry = buckets.get(clientKey)

  if (!entry || now >= entry.resetAt) {
    buckets.set(clientKey, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }

  if (entry.count >= MAX_REQUESTS) {
    return { ok: false }
  }

  entry.count += 1
  return { ok: true }
}

export function resolveClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown"
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  return "unknown"
}
