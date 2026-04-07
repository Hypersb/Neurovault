import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UpdateBrainSchema } from '@/lib/validators'
import { getBrainById, updateBrain, deleteBrain } from '@/lib/services/brain'
import { logger } from '@/lib/utils/logger'
import {
  applyRateLimit,
  buildRateLimitKey,
  RATE_LIMIT_RULES,
  rateLimitExceededResponse,
} from '@/lib/security/rate-limit'
import type { ApiResponse } from '@/types'

interface Params {
  params: Promise<{ brainId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { brainId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json<ApiResponse>({ data: null, error: 'Unauthorized', success: false }, { status: 401 })

    const brain = await getBrainById(brainId)
    if (!brain || brain.userId !== user.id) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Not found', success: false }, { status: 404 })
    }

    return NextResponse.json<ApiResponse>({ data: brain, error: null, success: true })
  } catch (err) {
    logger.error('GET /api/brains/[brainId]', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { brainId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json<ApiResponse>({ data: null, error: 'Unauthorized', success: false }, { status: 401 })

    const rateLimit = applyRateLimit(buildRateLimitKey(req, user.id), RATE_LIMIT_RULES.writeDefault)
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const brain = await getBrainById(brainId)
    if (!brain || brain.userId !== user.id) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Not found', success: false }, { status: 404 })
    }

    if (brain.isLegacy) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Brain is in legacy (read-only) mode', success: false }, { status: 403 })
    }

    const body = await req.json()
    const parsed = UpdateBrainSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>({ data: null, error: parsed.error.message, success: false }, { status: 400 })
    }

    const updated = await updateBrain(brainId, parsed.data)
    return NextResponse.json<ApiResponse>({ data: updated, error: null, success: true })
  } catch (err) {
    logger.error('PATCH /api/brains/[brainId]', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { brainId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json<ApiResponse>({ data: null, error: 'Unauthorized', success: false }, { status: 401 })

    const rateLimit = applyRateLimit(
      buildRateLimitKey(_req, user.id),
      RATE_LIMIT_RULES.brainDelete
    )
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const brain = await getBrainById(brainId)
    if (!brain || brain.userId !== user.id) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Not found', success: false }, { status: 404 })
    }

    await deleteBrain(brainId)
    return NextResponse.json<ApiResponse>({ data: null, error: null, success: true })
  } catch (err) {
    logger.error('DELETE /api/brains/[brainId]', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}
