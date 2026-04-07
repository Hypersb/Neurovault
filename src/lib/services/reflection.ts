// ============================================================
// Reflection & Self-Improvement Engine
// ============================================================
import { generateCompletion } from '@/lib/ai/openai'
import { storeMemory, applyMemoryDecay, searchMemories } from './memory'
import { extractEntitiesAndRelationships } from './knowledge-graph'
import { logger } from '@/lib/utils/logger'
import type { ChatMessage } from '@/types'

interface ReflectionResult {
  summary: string
  newMemoriesCreated: number
  conceptsExtracted: number
  skillGapsDetected: string[]
}

// ─── Post-Conversation Reflection ────────────────────────────
export async function runPostConversationReflection(
  brainId: string,
  messages: ChatMessage[]
): Promise<ReflectionResult> {
  logger.info('Running post-conversation reflection', { brainId })

  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  // Step 1: Extract key insights and skill gaps
  const { content: analysisContent } = await generateCompletion([
    {
      role: 'system',
      content: `You are a self-improvement engine analyzing a conversation to extract learning insights.
Return a JSON object only.`,
    },
    {
      role: 'user',
      content: `Analyze this conversation and extract:
1. Key facts or insights worth remembering
2. Knowledge gaps or uncertainties revealed
3. A brief summary of what was learned

Conversation:
${transcript.slice(0, 6000)}

Return JSON:
{
  "insights": ["insight 1", "insight 2"],
  "skillGaps": ["gap 1", "gap 2"],
  "summary": "brief summary"
}`,
    },
  ])

  let analysis: {
    insights: string[]
    skillGaps: string[]
    summary: string
  }

  try {
    const jsonMatch = analysisContent.match(/\{[\s\S]*\}/)
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { insights: [], skillGaps: [], summary: '' }
  } catch {
    analysis = { insights: [], skillGaps: [], summary: '' }
  }

  // Step 2: Store new insights as memories (check for duplicates first)
  let newMemoriesCreated = 0

  for (const insight of analysis.insights ?? []) {
    if (!insight || insight.length < 10) continue

    // Check if similar memory already exists
    const similar = await searchMemories({
      brainId,
      query: insight,
      topK: 1,
      minConfidence: 0.6,
    })

    const tooSimilar = similar.some((m) => m.similarity > 0.92)
    if (!tooSimilar) {
      await storeMemory({
        brainId,
        content: insight,
        sourceType: 'reflection',
        confidenceScore: 0.75,
        metadataTags: ['reflection', 'auto-extracted'],
      })
      newMemoriesCreated++
    }
  }

  // Step 3: Extract new entities from the conversation
  const { conceptsCreated } = await extractEntitiesAndRelationships(
    transcript,
    brainId
  )

  // Step 4: Apply memory decay
  await applyMemoryDecay(brainId)

  logger.info('Reflection complete', {
    newMemoriesCreated,
    conceptsCreated,
    skillGaps: analysis.skillGaps?.length ?? 0,
  })

  return {
    summary: analysis.summary || '',
    newMemoriesCreated,
    conceptsExtracted: conceptsCreated,
    skillGapsDetected: analysis.skillGaps ?? [],
  }
}

// ─── Confidence Update ────────────────────────────────────────
export async function updateMemoryConfidenceOnUse(
  memoryIds: string[]
): Promise<void> {
  // Imported inline to avoid circular deps
  const { db } = await import('@/lib/db')
  const { memories } = await import('@/lib/db/schema')
  const { sql } = await import('drizzle-orm')

  if (memoryIds.length === 0) return

  await db.execute(
    sql`
      UPDATE memories
      SET confidence_score = LEAST(1.0, confidence_score + 0.02),
          usage_count = usage_count + 1,
          last_accessed = NOW()
      WHERE id = ANY(${memoryIds}::uuid[])
    `
  )
}
