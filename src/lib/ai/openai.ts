// ============================================================
// OpenAI service – embeddings, completions, Whisper
// ============================================================
import OpenAI from 'openai'
import { logger } from '@/lib/utils/logger'
import { retry } from '@/lib/utils'
import { env } from '@/lib/config/env-server'
import {
  EMBEDDING_MODEL,
  assertEmbeddingDimensions,
  trimEmbeddingInput,
} from '@/lib/ai/embeddings'
import type { TokenUsage } from '@/types'

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
})

// ─── Embeddings ───────────────────────────────────────────────
export async function generateEmbedding(text: string): Promise<number[]> {
  return retry(async () => {
    logger.info('Generating embedding', { textLength: text.length })
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimEmbeddingInput(text),
    })
    return assertEmbeddingDimensions(response.data[0].embedding)
  })
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return retry(async () => {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map((t) => trimEmbeddingInput(t)),
    })
    return response.data.map((d) => assertEmbeddingDimensions(d.embedding))
  })
}

// ─── Completions ──────────────────────────────────────────────
export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: false
}

export async function generateCompletion(
  messages: CompletionMessage[],
  options: CompletionOptions = {}
): Promise<{ content: string; usage: TokenUsage }> {
  const {
    model = 'gpt-4o-mini',
    temperature = 0.7,
    maxTokens = 2000,
  } = options

  return retry(async () => {
    logger.info('Generating completion', { model, messages: messages.length })

    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    })

    const usage: TokenUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
      model,
      operation: 'completion',
    }

    return {
      content: response.choices[0].message.content ?? '',
      usage,
    }
  })
}

export async function* streamCompletion(
  messages: CompletionMessage[],
  options: { model?: string; temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<string, void, unknown> {
  const {
    model = 'gpt-4o-mini',
    temperature = 0.7,
    maxTokens = 2000,
  } = options

  logger.info('Streaming completion', { model })

  const stream = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield delta
  }
}

// ─── Whisper Transcription ────────────────────────────────────
export async function transcribeAudio(
  audioUrl: string,
  fileName: string
): Promise<string> {
  return retry(async () => {
    logger.info('Transcribing audio', { fileName })

    // Fetch the audio file
    const response = await fetch(audioUrl)
    const blob = await response.blob()
    const file = new File([blob], fileName, { type: blob.type })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    })

    return transcription.text
  })
}

// ─── JSON Extraction ──────────────────────────────────────────
export async function extractJSON<T>(
  prompt: string,
  systemPrompt: string
): Promise<T> {
  const { content } = await generateCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ])

  // Extract JSON from response
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
    content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)

  if (!jsonMatch) {
    throw new Error('No JSON found in response')
  }

  return JSON.parse(jsonMatch[1] || jsonMatch[0]) as T
}
