import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrainById, exportBrain } from '@/lib/services/brain'
import { logger } from '@/lib/utils/logger'

interface Params {
  params: Promise<{ brainId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { brainId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const brain = await getBrainById(brainId)
    if (!brain || brain.userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }

    const exportData = await exportBrain(brainId)
    const json = JSON.stringify(exportData, null, 2)

    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="brain-${brain.name.toLowerCase().replace(/\s+/g, '-')}-export.json"`,
      },
    })
  } catch (err) {
    logger.error('GET /api/brains/[brainId]/export', { error: String(err) })
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
