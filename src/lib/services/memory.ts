// ============================================================
// Memory Service – Short-Term + Long-Term + Reflection
// ============================================================
import { db } from '@/lib/db'
import { memories, conversations, tokenUsageLogs } from '@/lib/db/schema'
import { encrypt, decrypt } from '@/lib/utils/encryption'
import { generateEmbedding } from '@/lib/ai/openai'
import { generateCompletion } from '@/lib/ai/openai'
import { logger } from '@/lib/utils/logger'
import { rerankMemoryResults } from './retrieval'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { Memory, MemorySearchResult, MemorySourceType, ChatMessage } from '@/types'

// ─── Short-Term Window Config ─────────────────────────────────
const MAX_WINDOW_TOKENS = 3000
const AVG_CHARS_PER_TOKEN = 4
const SUMMARY_TRIGGER_TOKENS = 2800

// ─── Short-Term Memory ────────────────────────────────────────
export function buildShortTermContext(messages: ChatMessage[]): {
  messages: ChatMessage[]
  needsSummary: boolean
} {
  const totalChars = messages.reduce((acc, m) => acc + m.content.length, 0)
  const estimatedTokens = Math.ceil(totalChars / AVG_CHARS_PER_TOKEN)

  if (estimatedTokens < SUMMARY_TRIGGER_TOKENS) {
    return { messages, needsSummary: false }
  }

  // Keep last 4 messages + summarize rest
  const recent = messages.slice(-4)
  return { messages: recent, needsSummary: true }
}

export async function summarizeConversation(
  messages: ChatMessage[]
): Promise<string> {
  logger.info('Summarizing conversation', { messageCount: messages.length })

  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const { content } = await generateCompletion([
    {
      role: 'system',
      content:
        'You are a memory summarizer. Summarize the following conversation, preserving all important facts, decisions, and context. Be concise.',
    },
    { role: 'user', content: transcript },
  ])

  return content
}

// ─── Long-Term Memory ─────────────────────────────────────────
export async function storeMemory(params: {
  brainId: string
  content: string
  sourceType: MemorySourceType
  confidenceScore?: number
  metadataTags?: string[]
}): Promise<Memory> {
  const { brainId, content, sourceType, confidenceScore = 0.8, metadataTags = [] } = params

  logger.info('Storing memory', { brainId, sourceType })

  const [embedding, encryptedContent] = await Promise.all([
    generateEmbedding(content),
    Promise.resolve(encrypt(content)),
  ])

  const [row] = await db
    .insert(memories)
    .values({
      brainId,
      encryptedContent,
      embedding,
      sourceType,
      confidenceScore,
      metadataTags,
    })
    .returning()

  return mapMemory(row, content)
}

export async function searchMemories(params: {
  brainId: string
  query: string
  topK?: number
  minConfidence?: number
  candidateMultiplier?: number
}): Promise<MemorySearchResult[]> {
  const {
    brainId,
    query,
    topK = 5,
    minConfidence = 0.3,
    candidateMultiplier = 1,
  } = params

  const candidateLimit = Math.max(topK, topK * Math.max(1, candidateMultiplier))

  logger.info('Searching memories', { brainId, topK, minConfidence })

  const queryEmbedding = await generateEmbedding(query)
  const embeddingStr = `[${queryEmbedding.join(',')}]`

  const results = await db.execute<{
    id: string
    brain_id: string
    encrypted_content: string
    embedding: string
    source_type: string
    confidence_score: number
    usage_count: number
    last_accessed: string | null
    metadata_tags: string[]
    created_at: string
    similarity: number
  }>(
    sql`
      SELECT *, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM memories
      WHERE brain_id = ${brainId}::uuid
        AND confidence_score >= ${minConfidence}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${candidateLimit}
    `
  )

  // Decrypt and update usage stats
  const mapped = results.rows
    .filter((r) => r.similarity > 0.3)
    .map((r) => {
      const content = decrypt(r.encrypted_content)
      return {
        id: r.id,
        brainId: r.brain_id,
        content,
        encryptedContent: r.encrypted_content,
        embedding: null,
        sourceType: r.source_type as MemorySourceType,
        confidenceScore: r.confidence_score,
        usageCount: r.usage_count,
        lastAccessed: r.last_accessed ? new Date(r.last_accessed) : null,
        metadataTags: r.metadata_tags ?? [],
        createdAt: new Date(r.created_at),
        similarity: r.similarity,
      } as MemorySearchResult
    })

  // Update access stats asynchronously
  if (mapped.length > 0) {
    const ids = mapped.map((m) => m.id)
    db.execute(
      sql`
        UPDATE memories
        SET usage_count = usage_count + 1,
            last_accessed = NOW()
        WHERE id = ANY(${ids}::uuid[])
      `
    ).catch(() => {})
  }

  return mapped
}

export async function searchMemoriesHybrid(params: {
  brainId: string
  query: string
  topK?: number
  minConfidence?: number
  candidateMultiplier?: number
}): Promise<MemorySearchResult[]> {
  const {
    brainId,
    query,
    topK = 5,
    minConfidence = 0.3,
    candidateMultiplier = 3,
  } = params

  const candidates = await searchMemories({
    brainId,
    query,
    topK,
    minConfidence,
    candidateMultiplier,
  })

  return rerankMemoryResults(query, candidates, topK)
}

export async function getMemoriesByBrain(
  brainId: string,
  page = 1,
  pageSize = 20
): Promise<{ memories: Memory[]; total: number }> {
  const offset = (page - 1) * pageSize

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(memories)
      .where(eq(memories.brainId, brainId))
      .orderBy(desc(memories.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(memories)
      .where(eq(memories.brainId, brainId)),
  ])

  const mapped = rows.map((r) => {
    const content = decrypt(r.encryptedContent)
    return mapMemory(r, content)
  })

  return { memories: mapped, total: Number(countResult[0].count) }
}

export async function deleteMemoryForBrain(memoryId: string, brainId: string): Promise<boolean> {
  const rows = await db
    .delete(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.brainId, brainId)))
    .returning({ id: memories.id })

  return rows.length > 0
}

// ─── Memory Decay (Reflection) ────────────────────────────────
export async function applyMemoryDecay(brainId: string): Promise<void> {
  logger.info('Applying memory decay', { brainId })

  // Decrease confidence for memories not accessed in 30 days
  await db.execute(
    sql`
      UPDATE memories
      SET confidence_score = GREATEST(0.1, confidence_score * 0.95)
      WHERE brain_id = ${brainId}::uuid
        AND (last_accessed IS NULL OR last_accessed < NOW() - INTERVAL '30 days')
        AND confidence_score > 0.1
    `
  )

  // Archive very low confidence memories (< 0.15)
  await db.execute(
    sql`
      DELETE FROM memories
      WHERE brain_id = ${brainId}::uuid
        AND confidence_score < 0.15
        AND usage_count = 0
    `
  )
}

// ─── Token Logging ────────────────────────────────────────────
export async function logTokenUsage(params: {
  userId: string
  brainId?: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  model: string
  operation: string
}): Promise<void> {
  await db.insert(tokenUsageLogs).values(params).catch(() => {})
}

// ─── Helpers ──────────────────────────────────────────────────
function mapMemory(row: typeof memories.$inferSelect, content: string): Memory {
  return {
    id: row.id,
    brainId: row.brainId,
    content,
    encryptedContent: row.encryptedContent,
    embedding: null, // don't expose vectors to client
    sourceType: row.sourceType as MemorySourceType,
    confidenceScore: row.confidenceScore,
    usageCount: row.usageCount,
    lastAccessed: row.lastAccessed,
    metadataTags: row.metadataTags ?? [],
    createdAt: row.createdAt,
  }
}
