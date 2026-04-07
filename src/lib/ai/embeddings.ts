// ============================================================
// Embedding configuration and validation
// ============================================================

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536
export const EMBEDDING_MAX_INPUT_CHARS = 8000

export function trimEmbeddingInput(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, EMBEDDING_MAX_INPUT_CHARS)
}

export function assertEmbeddingDimensions(embedding: number[]): number[] {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
    )
  }

  return embedding
}
