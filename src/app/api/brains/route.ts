import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CreateBrainSchema } from '@/lib/validators'
import { createBrain, getUserBrains } from '@/lib/services/brain'
import { logger } from '@/lib/utils/logger'
import {
  applyRateLimit,
  buildRateLimitKey,
  RATE_LIMIT_RULES,
  rateLimitExceededResponse,
} from '@/lib/security/rate-limit'
import type { ApiResponse } from '@/types'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Unauthorized', success: false }, { status: 401 })
    }

    const brains = await getUserBrains(user.id)
    return NextResponse.json<ApiResponse>({ data: brains, error: null, success: true })
  } catch (err) {
    logger.error('GET /api/brains error', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Unauthorized', success: false }, { status: 401 })
    }

    const rateLimit = applyRateLimit(buildRateLimitKey(req, user.id), RATE_LIMIT_RULES.writeDefault)
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const body = await req.json()
    const parsed = CreateBrainSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json<ApiResponse>(
        { data: null, error: parsed.error.message, success: false },
        { status: 400 }
      )
    }

    const brain = await createBrain({ userId: user.id, ...parsed.data })
    return NextResponse.json<ApiResponse>({ data: brain, error: null, success: true }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/brains error', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}
