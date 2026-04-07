// ============================================================
// Chat Service – Context-Aware with Memory Injection
// ============================================================
import { db } from '@/lib/db'
import { conversations } from '@/lib/db/schema'
import { streamCompletion } from '@/lib/ai/openai'
import { searchMemoriesHybrid, buildShortTermContext, summarizeConversation } from './memory'
import { getBrainById } from './brain'
import { buildPersonalitySystemPrompt } from './personality'
import { findRelevantKnowledge } from './knowledge-graph'
import {
  buildCitationContext,
  buildGroundingSystemPrompt,
  buildSourceReferences,
  sanitizeTextForPrompt,
} from './retrieval'
import { logger } from '@/lib/utils/logger'
import { and, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage, Conversation } from '@/types'

// ─── Build Context ────────────────────────────────────────────
async function buildChatContext(
  brainId: string,
  userMessage: string,
  conversationMessages: ChatMessage[]
): Promise<{
  systemPrompt: string
  contextMessages: ChatMessage[]
  sourceReferences: ReturnType<typeof buildSourceReferences>
}> {
  const brain = await getBrainById(brainId)

  // Build personality system prompt
  const personalityPrompt = brain?.personalityProfile
    ? buildPersonalitySystemPrompt(brain.personalityProfile)
    : ''

  // Search long-term memory
  const relevantMemories = await searchMemoriesHybrid({
    brainId,
    query: userMessage,
    topK: 5,
    minConfidence: 0.4,
    candidateMultiplier: 4,
  })
  const sourceReferences = buildSourceReferences(relevantMemories)
  const memoryContext = buildCitationContext(relevantMemories)

  const relevantKnowledge = await findRelevantKnowledge(brainId, userMessage, 5)
  const conceptContext =
    relevantKnowledge.concepts.length > 0
      ? [
          'Concepts:',
          ...relevantKnowledge.concepts.map(
            (concept) =>
              `- ${concept.name} (importance=${concept.importanceScore.toFixed(2)}): ${sanitizeTextForPrompt(concept.description ?? 'No description', 240)}`
          ),
          relevantKnowledge.relationships.length > 0 ? 'Relationships:' : null,
          ...relevantKnowledge.relationships.map(
            (rel) =>
              `- ${rel.sourceConceptName} -> ${rel.targetConceptName} (${rel.relationshipType}, strength=${rel.strength.toFixed(2)})`
          ),
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n')
      : ''

  // Manage short-term window
  const { messages: windowMessages, needsSummary } = buildShortTermContext(
    conversationMessages
  )

  let contextMessages = windowMessages

  if (needsSummary && conversationMessages.length > 4) {
    const summary = await summarizeConversation(
      conversationMessages.slice(0, -4)
    )
    const summaryMessage: ChatMessage = {
      id: 'summary',
      role: 'user',
      content: `[Conversation summary: ${summary}]`,
      timestamp: new Date(),
    }
    contextMessages = [summaryMessage, ...windowMessages]
  }

  const systemPrompt = buildGroundingSystemPrompt({
    personalityPrompt,
    memoryContext,
    conceptContext,
  })

  return { systemPrompt, contextMessages, sourceReferences }
}

// ─── Stream Chat ──────────────────────────────────────────────
export async function* streamChat(params: {
  brainId: string
  userId: string
  conversationId?: string
  userMessage: string
}): AsyncGenerator<string, { conversationId: string; memoriesUsed: string[] }, unknown> {
  const { brainId, userId, userMessage } = params

  logger.info('Starting chat stream', { brainId, userId })

  // Load or create conversation
  let conversation: (typeof conversations.$inferSelect) | null = null

  if (params.conversationId) {
    const rows = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, params.conversationId),
          eq(conversations.brainId, brainId)
        )
      )
    conversation = rows[0] ?? null
  }

  const priorMessages: ChatMessage[] = conversation
    ? (conversation.messages as ChatMessage[])
    : []

  const { systemPrompt, contextMessages, sourceReferences } = await buildChatContext(
    brainId,
    userMessage,
    priorMessages
  )

  const newUserMessage: ChatMessage = {
    id: uuidv4(),
    role: 'user',
    content: userMessage,
    timestamp: new Date(),
  }

  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...contextMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

  let fullResponse = ''

  for await (const chunk of streamCompletion(apiMessages)) {
    fullResponse += chunk
    yield chunk
  }

  const assistantMessage: ChatMessage = {
    id: uuidv4(),
    role: 'assistant',
    content: fullResponse,
    timestamp: new Date(),
    memoriesUsed: sourceReferences.map((source) => source.sourceId),
  }

  const allMessages = [...priorMessages, newUserMessage, assistantMessage]

  // Save or update conversation
  const convId = params.conversationId ?? uuidv4()

  if (params.conversationId && conversation) {
    await db
      .update(conversations)
      .set({
        messages: allMessages,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, params.conversationId))
  } else {
    await db.insert(conversations).values({
      id: convId,
      brainId,
      messages: allMessages,
      totalTokens: 0,
    })
  }

  return {
    conversationId: convId,
    memoriesUsed: sourceReferences.map((source) => source.sourceId),
  }
}

// ─── Get Conversation ─────────────────────────────────────────
export async function getConversation(
  conversationId: string
): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))

  if (!row) return null

  return {
    id: row.id,
    brainId: row.brainId,
    messages: row.messages as ChatMessage[],
    summary: row.summary,
    totalTokens: row.totalTokens,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
