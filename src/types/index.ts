// ============================================================
// NEUROVAULT – Core Type Definitions
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Brain ───────────────────────────────────────────────────
export interface Brain {
  id: string
  userId: string
  name: string
  description: string | null
  isActive: boolean
  isLegacy: boolean
  version: number
  personalityProfile: PersonalityProfile | null
  createdAt: Date
  updatedAt: Date
}

export interface BrainSnapshot {
  id: string
  brainId: string
  version: number
  snapshotData: Json
  label: string | null
  createdAt: Date
}

// ─── Memory ──────────────────────────────────────────────────
export type MemorySourceType =
  | 'chat'
  | 'document'
  | 'reflection'
  | 'manual'
  | 'extraction'

export interface Memory {
  id: string
  brainId: string
  content: string // decrypted at service layer
  encryptedContent: string
  embedding: number[] | null
  sourceType: MemorySourceType
  confidenceScore: number
  usageCount: number
  lastAccessed: Date | null
  metadataTags: string[]
  createdAt: Date
}

export interface MemorySearchResult extends Memory {
  similarity: number
}

// ─── Knowledge Graph ─────────────────────────────────────────
export interface Concept {
  id: string
  brainId: string
  name: string
  description: string | null
  domain: string | null
  importanceScore: number
  createdAt: Date
  updatedAt: Date
}

export interface Relationship {
  id: string
  brainId: string
  sourceConceptId: string
  targetConceptId: string
  relationshipType: string
  strength: number
  createdAt: Date
}

export interface GraphNode {
  id: string
  label: string
  domain: string | null
  importanceScore: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
  strength: number
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ─── Personality ─────────────────────────────────────────────
export interface PersonalityProfile {
  tone: 'formal' | 'casual' | 'academic' | 'conversational' | 'technical'
  formalityLevel: number // 0-1
  vocabularyComplexity: number // 0-1
  sentenceComplexity: number // 0-1
  emotionalBaseline: 'neutral' | 'warm' | 'analytical' | 'empathetic'
  teachingStyle: 'socratic' | 'direct' | 'examples-first' | 'theoretical'
  domainExpertise: string[]
  communicationPatterns: string[]
  updatedAt: string
}

// ─── Training ────────────────────────────────────────────────
export type TrainingJobStatus =
  | 'queued'
  | 'retrying'
  | 'parsing'
  | 'embedding'
  | 'extracting'
  | 'graph-update'
  | 'completed'
  | 'failed'

export type TrainingFileType = 'pdf' | 'docx' | 'txt' | 'audio'

export interface TrainingJob {
  id: string
  brainId: string
  fileName: string
  fileType: TrainingFileType
  fileUrl: string
  idempotencyKey: string
  status: TrainingJobStatus
  progress: number
  errorMessage: string | null
  lastErrorCode: string | null
  attemptCount: number
  maxAttempts: number
  nextAttemptAt: Date
  lockedAt: Date | null
  lockedBy: string | null
  chunksProcessed: number
  totalChunks: number
  memoryCreated: number
  conceptsExtracted: number
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ─── Chat ────────────────────────────────────────────────────
export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: Date
  tokensUsed?: number
  memoriesUsed?: string[]
}

export interface Conversation {
  id: string
  brainId: string
  messages: ChatMessage[]
  summary: string | null
  totalTokens: number
  createdAt: Date
  updatedAt: Date
}

// ─── Brain Health ─────────────────────────────────────────────
export interface BrainHealthStats {
  memoryCount: number
  conceptCount: number
  relationshipCount: number
  avgConfidence: number
  confidenceDistribution: {
    high: number // >= 0.7
    medium: number // 0.4 - 0.7
    low: number // < 0.4
  }
  topDomains: { domain: string; count: number }[]
  trainingJobs: {
    completed: number
    failed: number
    inProgress: number
  }
  tokenUsage: number
  brainVersion: number
}

// ─── API Responses ───────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  data: T | null
  error: string | null
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// ─── Token Tracking ──────────────────────────────────────────
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  model: string
  operation: string
}
