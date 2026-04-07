import { NextResponse } from 'next/server'

type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

type Bucket = {
  timestamps: number[]
}

type RateLimitRule = {
  limit: number
  windowMs: number
}

const buckets = new Map<string, Bucket>()

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }

  const xRealIp = req.headers.get('x-real-ip')
  if (xRealIp) return xRealIp

  return 'unknown'
}

export function buildRateLimitKey(req: Request, userId?: string): string {
  const route = new URL(req.url).pathname
  const identity = userId ?? `ip:${getClientIp(req)}`
  return `${route}:${identity}`
}

export function applyRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now()
  const windowStart = now - rule.windowMs

  const bucket = buckets.get(key) ?? { timestamps: [] }
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart)

  if (bucket.timestamps.length >= rule.limit) {
    const oldest = bucket.timestamps[0]
    const resetAt = oldest + rule.windowMs
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    }
  }

  bucket.timestamps.push(now)
  buckets.set(key, bucket)

  // Best-effort cleanup for keys that have gone stale.
  if (buckets.size > 10_000) {
    for (const [mapKey, mapBucket] of buckets.entries()) {
      mapBucket.timestamps = mapBucket.timestamps.filter((ts) => ts > windowStart)
      if (mapBucket.timestamps.length === 0) {
        buckets.delete(mapKey)
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - bucket.timestamps.length),
    resetAt: now + rule.windowMs,
    retryAfterSeconds: 0,
  }
}

export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { data: null, error: 'Too many requests', success: false },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
      },
    }
  )
}

export const RATE_LIMIT_RULES = {
  writeDefault: { limit: 30, windowMs: 60_000 },
  chat: { limit: 30, windowMs: 60_000 },
  trainingCreate: { limit: 10, windowMs: 60_000 },
  brainDelete: { limit: 5, windowMs: 60_000 },
} as const
