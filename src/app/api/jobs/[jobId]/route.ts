import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTrainingJob } from '@/lib/services/training'
import { getBrainById } from '@/lib/services/brain'
import { logger } from '@/lib/utils/logger'
import type { ApiResponse } from '@/types'

interface Params {
  params: Promise<{ jobId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { jobId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json<ApiResponse>({ data: null, error: 'Unauthorized', success: false }, { status: 401 })

    const job = await getTrainingJob(jobId)
    if (!job) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Not found', success: false }, { status: 404 })
    }

    const brain = await getBrainById(job.brainId)
    if (!brain || brain.userId !== user.id) {
      return NextResponse.json<ApiResponse>({ data: null, error: 'Not found', success: false }, { status: 404 })
    }

    return NextResponse.json<ApiResponse>({ data: job, error: null, success: true })
  } catch (err) {
    logger.error('GET /api/jobs/[jobId]', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}
