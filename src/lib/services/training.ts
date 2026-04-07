// ============================================================
// Training Pipeline Service
// ============================================================
import { db } from '@/lib/db'
import { trainingJobs } from '@/lib/db/schema'
import { transcribeAudio } from '@/lib/ai/openai'
import { chunkText } from '@/lib/utils/chunking'
import { storeMemory } from './memory'
import { extractEntitiesAndRelationships } from './knowledge-graph'
import { analyzePersonality, mergePersonalityProfiles } from './personality'
import { getBrainById, updateBrain, incrementBrainVersion } from './brain'
import {
  calculateTrainingRetryDelayMs,
  canTransitionTrainingStatus,
  isTerminalTrainingStatus,
} from './training-state'
import { logger } from '@/lib/utils/logger'
import crypto from 'crypto'
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { TrainingJob, TrainingJobStatus } from '@/types'

const STALE_LOCK_MINUTES = 15
const DEFAULT_MAX_ATTEMPTS = 3

function getJobTag(jobId: string): string {
  return `job:${jobId}`
}

function deriveIdempotencyKey(params: {
  brainId: string
  fileName: string
  fileType: string
  fileUrl: string
  idempotencyKey?: string
}): string {
  if (params.idempotencyKey) {
    return crypto.createHash('sha256').update(params.idempotencyKey).digest('hex')
  }

  const raw = `${params.brainId}:${params.fileName}:${params.fileType}:${params.fileUrl}`
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function sanitizeMetadataTagValue(value: string): string {
  return value.replace(/\s+/g, '_').replace(/[:|]/g, '-').slice(0, 120)
}

// ─── Job Management ───────────────────────────────────────────
export async function createTrainingJob(params: {
  brainId: string
  fileName: string
  fileType: string
  fileUrl: string
  idempotencyKey?: string
  maxAttempts?: number
}): Promise<TrainingJob> {
  const dedupeKey = deriveIdempotencyKey(params)

  const [existing] = await db
    .select()
    .from(trainingJobs)
    .where(
      and(
        eq(trainingJobs.brainId, params.brainId),
        eq(trainingJobs.idempotencyKey, dedupeKey)
      )
    )
    .orderBy(desc(trainingJobs.createdAt))
    .limit(1)

  if (existing) {
    return mapJob(existing)
  }

  const [row] = await db
    .insert(trainingJobs)
    .values({
      brainId: params.brainId,
      fileName: params.fileName,
      fileType: params.fileType,
      fileUrl: params.fileUrl,
      idempotencyKey: dedupeKey,
      status: 'queued',
      maxAttempts: params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    })
    .returning()

  return mapJob(row)
}

export async function enqueueTrainingJob(jobId: string): Promise<TrainingJob | null> {
  const [row] = await db
    .update(trainingJobs)
    .set({
      status: 'queued',
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(trainingJobs.id, jobId))
    .returning()

  return row ? mapJob(row) : null
}

export async function getTrainingJob(jobId: string): Promise<TrainingJob | null> {
  const [row] = await db.select().from(trainingJobs).where(eq(trainingJobs.id, jobId))
  if (!row) return null
  return mapJob(row)
}

export async function getTrainingJobs(brainId: string): Promise<TrainingJob[]> {
  const rows = await db
    .select()
    .from(trainingJobs)
    .where(eq(trainingJobs.brainId, brainId))
    .orderBy(desc(trainingJobs.createdAt))
  return rows.map(mapJob)
}

async function updateJobStatus(
  jobId: string,
  status: TrainingJobStatus,
  extra: Partial<{
    progress: number
    errorMessage: string
    lastErrorCode: string | null
    nextAttemptAt: Date
    lockedAt: Date | null
    lockedBy: string | null
    completedAt: Date | null
    chunksProcessed: number
    totalChunks: number
    memoryCreated: number
    conceptsExtracted: number
  }> = {}
): Promise<void> {
  const current = await getTrainingJob(jobId)

  if (current && !canTransitionTrainingStatus(current.status, status)) {
    if (isTerminalTrainingStatus(current.status)) {
      return
    }
    logger.warn('Skipping invalid training job transition', {
      jobId,
      from: current.status,
      to: status,
    })
    return
  }

  await db
    .update(trainingJobs)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(trainingJobs.id, jobId))
}

export async function claimNextTrainingJob(workerId: string): Promise<TrainingJob | null> {
  return db.transaction(async (tx) => {
    const now = new Date()
    const staleThreshold = new Date(now.getTime() - STALE_LOCK_MINUTES * 60_000)

    const [candidate] = await tx
      .select({ id: trainingJobs.id })
      .from(trainingJobs)
      .where(
        and(
          inArray(trainingJobs.status, ['queued', 'retrying']),
          lte(trainingJobs.nextAttemptAt, now),
          or(isNull(trainingJobs.lockedAt), lte(trainingJobs.lockedAt, staleThreshold)),
          sql`${trainingJobs.attemptCount} < ${trainingJobs.maxAttempts}`
        )
      )
      .orderBy(asc(trainingJobs.nextAttemptAt), asc(trainingJobs.createdAt))
      .limit(1)

    if (!candidate) return null

    const [claimed] = await tx
      .update(trainingJobs)
      .set({
        status: 'parsing',
        updatedAt: now,
        startedAt: now,
        lockedAt: now,
        lockedBy: workerId,
        errorMessage: null,
        lastErrorCode: null,
        attemptCount: sql`${trainingJobs.attemptCount} + 1`,
      })
      .where(eq(trainingJobs.id, candidate.id))
      .returning()

    return claimed ? mapJob(claimed) : null
  })
}

export async function processNextTrainingJob(workerId: string): Promise<boolean> {
  const job = await claimNextTrainingJob(workerId)
  if (!job) return false

  await processTrainingJob(job.id, workerId)
  return true
}

async function cleanupJobArtifacts(job: TrainingJob): Promise<void> {
  const jobTag = getJobTag(job.id)

  // Remove chunks previously created by this same job to keep retries idempotent.
  await db.execute(sql`
    DELETE FROM memories
    WHERE brain_id = ${job.brainId}::uuid
      AND ${jobTag} = ANY(metadata_tags)
  `)
}

// ─── Text Extraction ──────────────────────────────────────────
async function extractText(
  fileUrl: string,
  fileType: string,
  fileName: string
): Promise<string> {
  const response = await fetch(fileUrl)

  if (fileType === 'audio') {
    return transcribeAudio(fileUrl, fileName)
  }

  if (fileType === 'txt') {
    return response.text()
  }

  if (fileType === 'pdf') {
    // Dynamic import for server-side only
    const arrayBuffer = await response.arrayBuffer()
    const pdfParse = await import('pdf-parse')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parse = (pdfParse as any).default ?? pdfParse
    const data = await parse(Buffer.from(arrayBuffer))
    return data.text
  }

  if (fileType === 'docx') {
    const mammoth = await import('mammoth')
    const arrayBuffer = await response.arrayBuffer()
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) })
    return result.value
  }

  throw new Error(`Unsupported file type: ${fileType}`)
}

// ─── Main Pipeline ────────────────────────────────────────────
export async function processTrainingJob(jobId: string, workerId: string): Promise<void> {
  const job = await getTrainingJob(jobId)
  if (!job) throw new Error(`Job ${jobId} not found`)

  if (job.lockedBy !== workerId) {
    throw new Error(`Job ${jobId} is not locked by worker ${workerId}`)
  }

  logger.info('Starting training job', { jobId, brainId: job.brainId })

  try {
    await cleanupJobArtifacts(job)

    // Phase 1: Parsing
    await updateJobStatus(jobId, 'parsing', { progress: 0.05 })
    const text = await extractText(job.fileUrl, job.fileType, job.fileName)

    if (!text || text.trim().length === 0) {
      throw new Error('No text could be extracted from the file')
    }

    // Phase 2: Chunking + Embedding
    await updateJobStatus(jobId, 'embedding', { progress: 0.2 })
    const chunks = chunkText(text, 400, 50)
    const totalChunks = chunks.length

    await updateJobStatus(jobId, 'embedding', { totalChunks, progress: 0.25 })

    // Process chunks in batches
    const BATCH_SIZE = 10
    let memoryCreated = 0

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)

      // Store each chunk as memory
      for (const chunk of batch) {
        await storeMemory({
          brainId: job.brainId,
          content: chunk.content,
          sourceType: 'document',
          confidenceScore: 0.85,
          metadataTags: [
            getJobTag(job.id),
            `source:file:${sanitizeMetadataTagValue(job.fileName)}`,
            `source:type:${sanitizeMetadataTagValue(job.fileType)}`,
            `chunk:index:${chunk.index}`,
            `chunk:tokens:${chunk.tokens}`,
            `chunk:start:${chunk.startChar ?? -1}`,
            `chunk:end:${chunk.endChar ?? -1}`,
          ],
        })
        memoryCreated++
      }

      const progress = 0.25 + (i / chunks.length) * 0.35
      await updateJobStatus(jobId, 'embedding', {
        progress,
        chunksProcessed: Math.min(i + BATCH_SIZE, chunks.length),
        memoryCreated,
      })
    }

    // Phase 3: Entity Extraction
    await updateJobStatus(jobId, 'extracting', { progress: 0.65, memoryCreated })

    // Extract from full text (up to 8k chars)
    const { conceptsCreated: conceptsExtracted } = await extractEntitiesAndRelationships(
      text.slice(0, 8000),
      job.brainId
    )

    // Phase 4: Knowledge Graph Update
    await updateJobStatus(jobId, 'graph-update', {
      progress: 0.8,
      conceptsExtracted,
    })

    // Phase 5: Personality Update
    const brain = await getBrainById(job.brainId)
    const newProfile = await analyzePersonality(text, job.brainId)

    if (brain?.personalityProfile) {
      const merged = mergePersonalityProfiles(brain.personalityProfile, newProfile, 0.3)
      await updateBrain(job.brainId, { personalityProfile: merged })
    }

    // Increment brain version
    await incrementBrainVersion(job.brainId)

    // Complete
    await updateJobStatus(jobId, 'completed', {
      progress: 1.0,
      chunksProcessed: totalChunks,
      totalChunks,
      memoryCreated,
      conceptsExtracted,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    })

    logger.info('Training job completed', { jobId, memoryCreated, conceptsExtracted })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const latest = await getTrainingJob(jobId)

    logger.error('Training job failed', {
      jobId,
      error: errorMessage,
      attemptCount: latest?.attemptCount,
      maxAttempts: latest?.maxAttempts,
    })

    const attemptCount = latest?.attemptCount ?? 1
    const maxAttempts = latest?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    const shouldRetry = attemptCount < maxAttempts
    const retryAt = new Date(Date.now() + calculateTrainingRetryDelayMs(attemptCount))

    await updateJobStatus(jobId, shouldRetry ? 'retrying' : 'failed', {
      errorMessage,
      lastErrorCode: 'PROCESSING_ERROR',
      nextAttemptAt: retryAt,
      lockedAt: null,
      lockedBy: null,
      completedAt: shouldRetry ? null : new Date(),
    })

    if (!shouldRetry) {
      throw err
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────
function mapJob(row: typeof trainingJobs.$inferSelect): TrainingJob {
  return {
    id: row.id,
    brainId: row.brainId,
    fileName: row.fileName,
    fileType: row.fileType as TrainingJob['fileType'],
    fileUrl: row.fileUrl,
    idempotencyKey: row.idempotencyKey,
    status: row.status as TrainingJobStatus,
    progress: row.progress,
    errorMessage: row.errorMessage,
    lastErrorCode: row.lastErrorCode,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt,
    lockedAt: row.lockedAt,
    lockedBy: row.lockedBy,
    chunksProcessed: row.chunksProcessed,
    totalChunks: row.totalChunks,
    memoryCreated: row.memoryCreated,
    conceptsExtracted: row.conceptsExtracted,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
