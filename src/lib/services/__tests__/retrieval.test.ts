import { describe, expect, it } from 'vitest'
import type { MemorySearchResult } from '../../../types'
import {
  buildCitationContext,
  buildSourceReferences,
  calculateKeywordOverlapScore,
  parseSourceMetadata,
  rerankMemoryResults,
} from '../retrieval'

function memoryFactory(partial: Partial<MemorySearchResult>): MemorySearchResult {
  return {
    id: partial.id ?? 'memory-1',
    brainId: partial.brainId ?? 'brain-1',
    content: partial.content ?? 'default content',
    encryptedContent: partial.encryptedContent ?? 'encrypted',
    embedding: null,
    sourceType: partial.sourceType ?? 'document',
    confidenceScore: partial.confidenceScore ?? 0.8,
    usageCount: partial.usageCount ?? 0,
    lastAccessed: partial.lastAccessed ?? null,
    metadataTags: partial.metadataTags ?? [],
    createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    similarity: partial.similarity ?? 0.5,
  }
}

describe('retrieval utilities', () => {
  it('scores keyword overlap from query to content', () => {
    const score = calculateKeywordOverlapScore(
      'graph neural networks for molecules',
      'This section explains molecular graph neural networks and training details.'
    )

    expect(score).toBeGreaterThan(0.4)
  })

  it('reranks by hybrid score and keeps best matches', () => {
    const query = 'postgres vector dimensions'
    const memories: MemorySearchResult[] = [
      memoryFactory({
        id: 'm1',
        similarity: 0.91,
        content: 'General project roadmap with no database details.',
      }),
      memoryFactory({
        id: 'm2',
        similarity: 0.72,
        content: 'The pgvector schema stores embedding dimensions and vector index settings.',
      }),
      memoryFactory({
        id: 'm3',
        similarity: 0.7,
        content: 'Postgres vector dimensions are fixed and must match embedding model output.',
      }),
    ]

    const reranked = rerankMemoryResults(query, memories, 2)

    expect(reranked).toHaveLength(2)
    expect(reranked[0].id).toBe('m3')
  })

  it('parses metadata tags into citation-ready source references', () => {
    const parsed = parseSourceMetadata([
      'source:file:design-doc.pdf',
      'source:type:pdf',
      'chunk:index:4',
      'chunk:start:1200',
      'chunk:end:1820',
    ])

    expect(parsed.fileName).toBe('design-doc.pdf')
    expect(parsed.fileType).toBe('pdf')
    expect(parsed.chunkIndex).toBe(4)
    expect(parsed.charStart).toBe(1200)
    expect(parsed.charEnd).toBe(1820)
  })

  it('builds source references and citation context labels', () => {
    const memories: MemorySearchResult[] = [
      memoryFactory({
        id: 'mem-a',
        content: 'Chunk A details for source tracing.',
        metadataTags: ['source:file:spec.txt', 'chunk:index:2', 'chunk:start:300', 'chunk:end:620'],
        similarity: 0.88,
      }),
    ]

    const sources = buildSourceReferences(memories)
    const citationBlock = buildCitationContext(memories)

    expect(sources[0].sourceLabel).toBe('spec.txt')
    expect(sources[0].chunkIndex).toBe(2)
    expect(citationBlock).toContain('S1')
    expect(citationBlock).toContain('file=spec.txt')
    expect(citationBlock).toContain('id=mem-a')
  })
})
