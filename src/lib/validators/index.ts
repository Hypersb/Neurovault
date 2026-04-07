import { z } from 'zod'

export const CreateBrainSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

export const UpdateBrainSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isLegacy: z.boolean().optional(),
})

export const ChatMessageSchema = z.object({
  brainId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
})

export const CreateMemorySchema = z.object({
  brainId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  sourceType: z.enum(['chat', 'document', 'reflection', 'manual', 'extraction']),
  confidenceScore: z.number().min(0).max(1).optional(),
  metadataTags: z.array(z.string()).optional(),
})

export const SearchMemorySchema = z.object({
  brainId: z.string().uuid(),
  query: z.string().min(1).max(500),
  topK: z.number().int().min(1).max(20).optional().default(5),
  minConfidence: z.number().min(0).max(1).optional().default(0.3),
})

export const TrainBrainSchema = z.object({
  brainId: z.string().uuid(),
  fileName: z.string().min(1),
  fileType: z.enum(['pdf', 'docx', 'txt', 'audio']),
  fileUrl: z.string().url(),
  idempotencyKey: z.string().min(8).max(256).optional(),
})

export const BrainSnapshotSchema = z.object({
  brainId: z.string().uuid(),
  label: z.string().max(200).optional(),
})

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
})
