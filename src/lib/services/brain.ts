// ============================================================
// Brain Service
// ============================================================
import { db } from '@/lib/db'
import { brains, brainSnapshots, memories, concepts, relationships } from '@/lib/db/schema'
import { encrypt, decrypt } from '@/lib/utils/encryption'
import { logger } from '@/lib/utils/logger'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { Brain, BrainSnapshot, BrainHealthStats, PersonalityProfile, Json } from '@/types'

// ─── CRUD ─────────────────────────────────────────────────────
export async function createBrain(params: {
  userId: string
  name: string
  description?: string
}): Promise<Brain> {
  logger.info('Creating brain', { userId: params.userId, name: params.name })

  const [row] = await db
    .insert(brains)
    .values({
      userId: params.userId,
      name: params.name,
      description: params.description ?? null,
    })
    .returning()

  return mapBrain(row)
}

export async function getBrainById(id: string): Promise<Brain | null> {
  const [row] = await db.select().from(brains).where(eq(brains.id, id))
  if (!row) return null
  return mapBrain(row)
}

export async function getUserBrains(userId: string): Promise<Brain[]> {
  const rows = await db
    .select()
    .from(brains)
    .where(eq(brains.userId, userId))
    .orderBy(desc(brains.updatedAt))
  return rows.map(mapBrain)
}

export async function updateBrain(
  id: string,
  updates: Partial<{
    name: string
    description: string
    isLegacy: boolean
    personalityProfile: PersonalityProfile
  }>
): Promise<Brain> {
  const [row] = await db
    .update(brains)
    .set({
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.isLegacy !== undefined && { isLegacy: updates.isLegacy }),
      ...(updates.personalityProfile !== undefined && { personalityProfile: updates.personalityProfile }),
      updatedAt: new Date(),
    })
    .where(eq(brains.id, id))
    .returning()

  return mapBrain(row)
}

export async function deleteBrain(id: string): Promise<void> {
  logger.info('Deleting brain', { id })
  await db.delete(brains).where(eq(brains.id, id))
}

export async function incrementBrainVersion(brainId: string): Promise<void> {
  await db.execute(
    sql`UPDATE brains SET version = version + 1, updated_at = NOW() WHERE id = ${brainId}::uuid`
  )
}

// ─── Snapshots ────────────────────────────────────────────────
export async function createBrainSnapshot(params: {
  brainId: string
  label?: string
}): Promise<BrainSnapshot> {
  logger.info('Creating brain snapshot', { brainId: params.brainId })

  // Serialize brain state
  const [brain] = await db.select().from(brains).where(eq(brains.id, params.brainId))
  const brainMemories = await db.select().from(memories).where(eq(memories.brainId, params.brainId))
  const brainConcepts = await db.select().from(concepts).where(eq(concepts.brainId, params.brainId))
  const brainRelationships = await db.select().from(relationships).where(eq(relationships.brainId, params.brainId))

  const snapshotData = {
    brain,
    memories: brainMemories.map((m) => ({ ...m, embedding: null })),
    concepts: brainConcepts,
    relationships: brainRelationships,
    exportedAt: new Date().toISOString(),
  }

  const [row] = await db
    .insert(brainSnapshots)
    .values({
      brainId: params.brainId,
      version: brain.version,
      snapshotData,
      label: params.label ?? null,
    })
    .returning()

  return {
    id: row.id,
    brainId: row.brainId,
    version: row.version,
    snapshotData: row.snapshotData as Json,
    label: row.label,
    createdAt: row.createdAt,
  }
}

export async function getBrainSnapshots(brainId: string): Promise<BrainSnapshot[]> {
  const rows = await db
    .select()
    .from(brainSnapshots)
    .where(eq(brainSnapshots.brainId, brainId))
    .orderBy(desc(brainSnapshots.createdAt))

  return rows.map((r) => ({
    id: r.id,
    brainId: r.brainId,
    version: r.version,
    snapshotData: r.snapshotData as Json,
    label: r.label,
    createdAt: r.createdAt,
  }))
}

// ─── Health Stats ─────────────────────────────────────────────
export async function getBrainHealthStats(brainId: string): Promise<BrainHealthStats> {
  const [
    memCount,
    conceptCount,
    relCount,
    confDist,
    brain,
    domainGroups,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(memories).where(eq(memories.brainId, brainId)),
    db.select({ count: sql<number>`count(*)` }).from(concepts).where(eq(concepts.brainId, brainId)),
    db.select({ count: sql<number>`count(*)` }).from(relationships).where(eq(relationships.brainId, brainId)),
    db.execute<{ high: string; medium: string; low: string; avg: string }>(
      sql`
        SELECT
          COUNT(*) FILTER (WHERE confidence_score >= 0.7) AS high,
          COUNT(*) FILTER (WHERE confidence_score >= 0.4 AND confidence_score < 0.7) AS medium,
          COUNT(*) FILTER (WHERE confidence_score < 0.4) AS low,
          AVG(confidence_score) AS avg
        FROM memories
        WHERE brain_id = ${brainId}::uuid
      `
    ),
    db.select().from(brains).where(eq(brains.id, brainId)),
    db.execute<{ domain: string; count: string }>(
      sql`
        SELECT domain, COUNT(*) as count FROM concepts
        WHERE brain_id = ${brainId}::uuid AND domain IS NOT NULL
        GROUP BY domain ORDER BY count DESC LIMIT 5
      `
    ),
  ])

  const conf = confDist.rows[0]

  return {
    memoryCount: Number(memCount[0].count),
    conceptCount: Number(conceptCount[0].count),
    relationshipCount: Number(relCount[0].count),
    avgConfidence: parseFloat(conf?.avg ?? '0'),
    confidenceDistribution: {
      high: Number(conf?.high ?? 0),
      medium: Number(conf?.medium ?? 0),
      low: Number(conf?.low ?? 0),
    },
    topDomains: domainGroups.rows.map((d) => ({
      domain: d.domain,
      count: Number(d.count),
    })),
    trainingJobs: { completed: 0, failed: 0, inProgress: 0 }, // filled by training service
    tokenUsage: brain[0]?.tokenUsage ?? 0,
    brainVersion: brain[0]?.version ?? 1,
  }
}

// ─── Export (JSON download) ───────────────────────────────────
export async function exportBrain(brainId: string): Promise<Record<string, unknown>> {
  const snapshot = await createBrainSnapshot({ brainId, label: 'export' })
  return snapshot.snapshotData as Record<string, unknown>
}

// ─── Helpers ──────────────────────────────────────────────────
function mapBrain(row: typeof brains.$inferSelect): Brain {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    isLegacy: row.isLegacy,
    version: row.version,
    personalityProfile: row.personalityProfile as PersonalityProfile | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
