import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/lib/logger";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
export const EMBEDDING_DIMENSIONS = 3072;

export { genAI };

// ─── Rate-limit / error helpers ──────────────────────────────────

export class GeminiRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiRateLimitError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

/** Extract HTTP status code from Gemini SDK errors */
function extractHttpStatus(err: unknown): number | undefined {
  if (err == null) return undefined;
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.httpStatusCode === "number") return e.httpStatusCode;
    if (typeof e.statusCode === "number") return e.statusCode;
  }
  // Fallback: parse from error message (e.g., "[429 Too Many Requests]")
  const msg = errMsg(err);
  const match = msg.match(/\b(429|500|502|503|504)\b/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Retry a Gemini API call with exponential backoff.
 * Retries on 429 (rate limit) and 5xx (server) errors.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  {
    maxRetries = 3,
    baseDelayMs = 2000,
    maxDelayMs = 30000,
    label = "Gemini API call",
  }: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    label?: string;
  } = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = extractHttpStatus(err);
      const isRateLimit = status === 429;
      const isServerError = status !== undefined && status >= 500;

      if (!isRateLimit && !isServerError) {
        throw err;
      }

      if (attempt === maxRetries) {
        logger.error(`${label}: all ${maxRetries} retries exhausted`, {
          status,
          error: errMsg(err),
        });
        break;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );

      logger.warn(
        `${label}: ${isRateLimit ? "rate limited" : "server error"} (${status}), retry in ${Math.round(delay)}ms (${attempt + 1}/${maxRetries})`,
        { status, attempt: attempt + 1 }
      );

      await sleep(delay);
    }
  }

  if (extractHttpStatus(lastError) === 429) {
    throw new GeminiRateLimitError(
      "The AI service is currently at capacity. Please wait a few minutes and try again."
    );
  }
  throw lastError;
}

// ─── Embeddings (gemini-embedding-001 → 3072 dimensions) ──────────

export function assertEmbeddingDimensions(embedding: number[], context: string): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch in ${context}: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
    );
  }
}

export async function createEmbedding(text: string): Promise<number[]> {
  return retryWithBackoff(
    async () => {
      const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
      const result = await model.embedContent(text);
      const embedding = result.embedding.values;
      assertEmbeddingDimensions(embedding, "createEmbedding");
      return embedding;
    },
    { label: "createEmbedding" }
  );
}

// ─── Batch Embeddings ─────────────────────────────────────────────

export async function createEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await createEmbedding(texts[0])];

  return retryWithBackoff(
    async () => {
      const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
      const result = await model.batchEmbedContents({
        requests: texts.map((text) => ({
          content: { role: "user", parts: [{ text }] },
        })),
      });
      const embeddings = result.embeddings.map((e) => e.values);
      embeddings.forEach((embedding, index) => {
        assertEmbeddingDimensions(embedding, `createEmbeddingsBatch[index=${index}]`);
      });
      return embeddings;
    },
    { label: `createEmbeddingsBatch(${texts.length})` }
  );
}

// ─── Entity extraction (JSON mode) ────────────────────────────────

export async function extractEntities(text: string): Promise<{
  concepts: { name: string; description: string; domain: string }[];
  relationships: { source: string; target: string; type: string }[];
}> {
  return retryWithBackoff(
    async () => {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: `Extract key concepts and relationships from the text. Return JSON only:
{
  "concepts": [{"name": "...", "description": "...", "domain": "..."}],
  "relationships": [{"source": "concept name", "target": "concept name", "type": "relates_to|causes|requires|part_of|example_of"}]
}`,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });

      const result = await model.generateContent(text);
      try {
        return JSON.parse(result.response.text());
      } catch {
        return { concepts: [], relationships: [] };
      }
    },
    { label: "extractEntities" }
  );
}

// ─── Summarization ────────────────────────────────────────────────

export async function summarizeText(text: string): Promise<string> {
  return retryWithBackoff(
    async () => {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction:
          "Summarize the following text concisely, preserving key facts and insights.",
        generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
      });
      const result = await model.generateContent(text);
      return result.response.text();
    },
    { label: "summarizeText" }
  );
}

// ─── Audio transcription ──────────────────────────────────────────

export async function transcribeAudio(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = file.type || "audio/mpeg";

  return retryWithBackoff(
    async () => {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent([
        {
          text: "Transcribe this audio accurately. Output only the transcription text, nothing else.",
        },
        { inlineData: { mimeType, data: base64 } },
      ]);
      return result.response.text();
    },
    { label: "transcribeAudio" }
  );
}
