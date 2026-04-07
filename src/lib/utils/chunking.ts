// ============================================================
// Document Chunking Utilities
// ============================================================

export interface Chunk {
  content: string
  index: number
  tokens: number
  startChar?: number
  endChar?: number
}

const AVG_CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN)
}

/**
 * Split text into overlapping chunks.
 * @param text Full document text
 * @param maxTokens Max tokens per chunk (default 400)
 * @param overlapTokens Overlap between chunks (default 50)
 */
export function chunkText(
  text: string,
  maxTokens = 400,
  overlapTokens = 50
): Chunk[] {
  const maxChars = maxTokens * AVG_CHARS_PER_TOKEN
  const overlapChars = Math.min(overlapTokens * AVG_CHARS_PER_TOKEN, Math.floor(maxChars / 2))
  const normalizedText = text.replace(/\r\n/g, '\n').trim()

  if (normalizedText.length === 0) return []

  // Prefer paragraph boundaries, then sentence boundaries.
  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)

  const chunks: Chunk[] = []
  let currentChunk = ''
  let currentChunkStart = 0
  let cursor = 0
  let chunkIndex = 0

  function pushCurrentChunk(): void {
    const content = currentChunk.trim()
    if (!content) return

    const startChar = Math.max(currentChunkStart, 0)
    const endChar = startChar + content.length
    chunks.push({
      content,
      index: chunkIndex++,
      tokens: estimateTokens(content),
      startChar,
      endChar,
    })
  }

  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)

    for (const sentence of sentences) {
      // Hard-split very long sentences to protect chunk limits.
      if (sentence.length > maxChars) {
        if (currentChunk.length > 0) {
          pushCurrentChunk()
          currentChunk = ''
        }

        for (let i = 0; i < sentence.length; i += maxChars - overlapChars) {
          const piece = sentence.slice(i, i + maxChars).trim()
          if (!piece) continue
          chunks.push({
            content: piece,
            index: chunkIndex++,
            tokens: estimateTokens(piece),
            startChar: cursor + i,
            endChar: cursor + i + piece.length,
          })
        }

        cursor += sentence.length + 1
        currentChunkStart = cursor
        continue
      }

      const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence
      if (candidate.length > maxChars && currentChunk.length > 0) {
        pushCurrentChunk()

        const overlapSlice = currentChunk.slice(-overlapChars).trim()
        currentChunk = overlapSlice ? `${overlapSlice} ${sentence}` : sentence
        currentChunkStart = Math.max(cursor - overlapSlice.length, 0)
      } else {
        if (!currentChunk) {
          currentChunkStart = cursor
        }
        currentChunk = candidate
      }

      cursor += sentence.length + 1
    }

    cursor += 1
  }

  if (currentChunk.trim().length > 0) pushCurrentChunk()

  return chunks
}
