import { createClient } from '@/lib/supabase/server'
import { getBrainById } from '@/lib/services/brain'
import { streamChat } from '@/lib/services/chat'
import { ChatMessageSchema } from '@/lib/validators'
import { logger } from '@/lib/utils/logger'
import {
  applyRateLimit,
  buildRateLimitKey,
  RATE_LIMIT_RULES,
  rateLimitExceededResponse,
} from '@/lib/security/rate-limit'

interface Params {
  params: Promise<{ brainId: string }>
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { brainId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const rateLimit = applyRateLimit(buildRateLimitKey(req, user.id), RATE_LIMIT_RULES.chat)
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit)
    }

    const brain = await getBrainById(brainId)
    if (!brain || brain.userId !== user.id) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }

    if (brain.isLegacy) {
      return new Response(JSON.stringify({ error: 'Brain is in legacy (read-only) mode' }), { status: 403 })
    }

    const body = await req.json()
    const parsed = ChatMessageSchema.safeParse({ brainId, ...body })

    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.message }), { status: 400 })
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = streamChat({
            brainId,
            userId: user.id,
            conversationId: body.conversationId,
            userMessage: body.message,
          })

          for await (const chunk of generator) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          logger.error('Stream error', { error: String(err) })
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    logger.error('POST /api/chat/[brainId]', { error: String(err) })
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
