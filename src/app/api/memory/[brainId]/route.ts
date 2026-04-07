import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrainById } from '@/lib/services/brain'
import { getMemoriesByBrain, searchMemories, deleteMemoryForBrain } from '@/lib/services/memory'
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

export async function GET(req: Request, { params }: Params) {
  try {
    const { brainId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json<ApiResponse>({ data: null, error: 'Unauthorized', success: false }, { status: 401 })

    const brain = await getBrainById(brainId)
    if (!brain || brain.userId !== user.id) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Not found', success: false }, { status: 404 })
    }

    const url = new URL(req.url)
    const query = url.searchParams.get('q')
    const page = Number(url.searchParams.get('page') ?? 1)
    const pageSize = Number(url.searchParams.get('pageSize') ?? 20)

    if (query) {
      const results = await searchMemories({
        brainId,
        query,
        topK: 10,
        minConfidence: 0.3,
      })
      return NextResponse.json<ApiResponse>({ data: results, error: null, success: true })
    }

    const { memories, total } = await getMemoriesByBrain(brainId, page, pageSize)

    return NextResponse.json<ApiResponse>({
      data: { memories, total, page, pageSize, hasMore: page * pageSize < total },
      error: null,
      success: true,
    })
  } catch (err) {
    logger.error('GET /api/memory/[brainId]', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: Params) {
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

    const body = await req.json()
    const memoryId = body.memoryId as string

    if (!memoryId) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'memoryId required', success: false }, { status: 400 })
    }

    const deleted = await deleteMemoryForBrain(memoryId, brainId)
    if (!deleted) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Not found', success: false }, { status: 404 })
    }

    return NextResponse.json<ApiResponse>({ data: null, error: null, success: true })
  } catch (err) {
    logger.error('DELETE /api/memory/[brainId]', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}
