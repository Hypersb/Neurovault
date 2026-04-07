import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrainById, createBrainSnapshot, getBrainSnapshots } from '@/lib/services/brain'
import { BrainSnapshotSchema } from '@/lib/validators'
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

    const snapshots = await getBrainSnapshots(brainId)
    return NextResponse.json<ApiResponse>({ data: snapshots, error: null, success: true })
  } catch (err) {
    logger.error('GET /api/brains/[brainId]/snapshots', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: Params) {
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

    const body = await req.json().catch(() => ({}))
    const parsed = BrainSnapshotSchema.safeParse({ brainId, ...body })
    if (!parsed.success) {
      return NextResponse.json<ApiResponse>({ data: null, error: parsed.error.message, success: false }, { status: 400 })
    }

    const snapshot = await createBrainSnapshot({ brainId, label: body.label })
    return NextResponse.json<ApiResponse>({ data: snapshot, error: null, success: true }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/brains/[brainId]/snapshots', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}
