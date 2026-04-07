import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrainById } from '@/lib/services/brain'
import { createTrainingJob, enqueueTrainingJob, getTrainingJobs } from '@/lib/services/training'
import { TrainBrainSchema } from '@/lib/validators'
import { validateTrainingUpload } from '@/lib/security/uploads'
import {
  applyRateLimit,
  buildRateLimitKey,
  RATE_LIMIT_RULES,
  rateLimitExceededResponse,
} from '@/lib/security/rate-limit'
import { logger } from '@/lib/utils/logger'
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

    const jobs = await getTrainingJobs(brainId)
    return NextResponse.json<ApiResponse>({ data: jobs, error: null, success: true })
  } catch (err) {
    logger.error('GET /api/train/[brainId]/jobs', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { brainId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json<ApiResponse>({ data: null, error: 'Unauthorized', success: false }, { status: 401 })

    const rateLimit = applyRateLimit(buildRateLimitKey(req, user.id), RATE_LIMIT_RULES.trainingCreate)
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
    const parsed = TrainBrainSchema.safeParse({ brainId, ...body })

    if (!parsed.success) {
      return NextResponse.json<ApiResponse>({ data: null, error: parsed.error.message, success: false }, { status: 400 })
    }

    const uploadValidation = await validateTrainingUpload({
      brainId,
      fileName: parsed.data.fileName,
      fileType: parsed.data.fileType,
      fileUrl: parsed.data.fileUrl,
    })

    if (!uploadValidation.valid) {
      return NextResponse.json<ApiResponse>(
        { data: null, error: uploadValidation.reason, success: false },
        { status: 400 }
      )
    }

    const job = await createTrainingJob(parsed.data)
    const queued = await enqueueTrainingJob(job.id)

    return NextResponse.json<ApiResponse>(
      { data: queued ?? job, error: null, success: true },
      { status: 202 }
    )
  } catch (err) {
    logger.error('POST /api/train/[brainId]/jobs', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}
