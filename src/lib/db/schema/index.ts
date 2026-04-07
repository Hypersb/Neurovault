// ============================================================
// NEUROVAULT – Drizzle ORM Schema
// ============================================================
import {
  pgTable,
  text,
  varchar,
  uuid,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { EMBEDDING_DIMENSIONS } from '@/lib/ai/embeddings'

// ─── Brains ──────────────────────────────────────────────────
export const brains = pgTable('brains', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  isLegacy: boolean('is_legacy').default(false).notNull(),
  version: integer('version').default(1).notNull(),
  personalityProfile: jsonb('personality_profile'),
  tokenUsage: integer('token_usage').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Brain Snapshots ─────────────────────────────────────────
export const brainSnapshots = pgTable('brain_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  brainId: uuid('brain_id')
    .notNull()
    .references(() => brains.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshotData: jsonb('snapshot_data').notNull(),
  label: varchar('label', { length: 200 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── Long-Term Memory ────────────────────────────────────────
export const memories = pgTable(
  'memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brainId: uuid('brain_id')
      .notNull()
      .references(() => brains.id, { onDelete: 'cascade' }),
    encryptedContent: text('encrypted_content').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    sourceType: varchar('source_type', { length: 50 }).notNull(),
    confidenceScore: real('confidence_score').default(0.8).notNull(),
    usageCount: integer('usage_count').default(0).notNull(),
    lastAccessed: timestamp('last_accessed'),
    metadataTags: text('metadata_tags').array().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    brainIdx: index('memories_brain_idx').on(table.brainId),
    embeddingIdx: index('memories_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  })
)

// ─── Concepts (Knowledge Graph) ───────────────────────────────
export const concepts = pgTable(
  'concepts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brainId: uuid('brain_id')
      .notNull()
      .references(() => brains.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    domain: varchar('domain', { length: 100 }),
    importanceScore: real('importance_score').default(0.5).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    brainIdx: index('concepts_brain_idx').on(table.brainId),
  })
)

// ─── Relationships (Knowledge Graph) ─────────────────────────
export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brainId: uuid('brain_id')
      .notNull()
      .references(() => brains.id, { onDelete: 'cascade' }),
    sourceConceptId: uuid('source_concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    targetConceptId: uuid('target_concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    relationshipType: varchar('relationship_type', { length: 100 }).notNull(),
    strength: real('strength').default(0.5).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    brainIdx: index('relationships_brain_idx').on(table.brainId),
  })
)

// ─── Conversations ───────────────────────────────────────────
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  brainId: uuid('brain_id')
    .notNull()
    .references(() => brains.id, { onDelete: 'cascade' }),
  messages: jsonb('messages').default([]).notNull(),
  summary: text('summary'),
  totalTokens: integer('total_tokens').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─── Training Jobs ───────────────────────────────────────────
export const trainingJobs = pgTable(
  'training_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brainId: uuid('brain_id')
      .notNull()
      .references(() => brains.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    fileType: varchar('file_type', { length: 20 }).notNull(),
    fileUrl: text('file_url').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    status: varchar('status', { length: 30 }).default('queued').notNull(),
    progress: real('progress').default(0).notNull(),
    errorMessage: text('error_message'),
    lastErrorCode: varchar('last_error_code', { length: 80 }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    nextAttemptAt: timestamp('next_attempt_at').defaultNow().notNull(),
    lockedAt: timestamp('locked_at'),
    lockedBy: varchar('locked_by', { length: 120 }),
    chunksProcessed: integer('chunks_processed').default(0).notNull(),
    totalChunks: integer('total_chunks').default(0).notNull(),
    memoryCreated: integer('memory_created').default(0).notNull(),
    conceptsExtracted: integer('concepts_extracted').default(0).notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    brainCreatedIdx: index('training_jobs_brain_created_idx').on(
      table.brainId,
      table.createdAt
    ),
    statusNextAttemptIdx: index('training_jobs_status_next_attempt_idx').on(
      table.status,
      table.nextAttemptAt
    ),
    brainIdempotencyKeyIdx: uniqueIndex('training_jobs_brain_idempotency_key_uidx').on(
      table.brainId,
      table.idempotencyKey
    ),
  })
)

// ─── Token Usage Log ─────────────────────────────────────────
export const tokenUsageLogs = pgTable('token_usage_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  brainId: uuid('brain_id'),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  operation: varchar('operation', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type DrizzleBrain = typeof brains.$inferSelect
export type DrizzleMemory = typeof memories.$inferSelect
export type DrizzleConcept = typeof concepts.$inferSelect
export type DrizzleRelationship = typeof relationships.$inferSelect
export type DrizzleTrainingJob = typeof trainingJobs.$inferSelect
export type DrizzleConversation = typeof conversations.$inferSelect
