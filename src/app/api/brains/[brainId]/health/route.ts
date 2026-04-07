import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrainById, getBrainHealthStats } from '@/lib/services/brain'
import { getTrainingJobs } from '@/lib/services/training'
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

    const [stats, jobs] = await Promise.all([
      getBrainHealthStats(brainId),
      getTrainingJobs(brainId),
    ])

    stats.trainingJobs = {
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      inProgress: jobs.filter((j) => !['completed', 'failed'].includes(j.status)).length,
    }

    return NextResponse.json<ApiResponse>({ data: stats, error: null, success: true })
  } catch (err) {
    logger.error('GET /api/brains/[brainId]/health', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}
