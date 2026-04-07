import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrainById } from '@/lib/services/brain'
import { getKnowledgeGraph } from '@/lib/services/knowledge-graph'
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

    const graph = await getKnowledgeGraph(brainId)
    return NextResponse.json<ApiResponse>({ data: graph, error: null, success: true })
  } catch (err) {
    logger.error('GET /api/graph/[brainId]', { error: String(err) })
    return NextResponse.json<ApiResponse>({ data: null, error: 'Internal server error', success: false }, { status: 500 })
  }
}
