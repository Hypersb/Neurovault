import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export { genAI };

// ─── Embeddings (gemini-embedding-001 → 3072 dimensions) ──────────
export async function createEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// ─── Entity extraction (JSON mode) ────────────────────────────────
export async function extractEntities(text: string): Promise<{
  concepts: { name: string; description: string; domain: string }[];
  relationships: { source: string; target: string; type: string }[];
}> {
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
}

// ─── Summarization ────────────────────────────────────────────────
export async function summarizeText(text: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: "Summarize the following text concisely, preserving key facts and insights.",
    generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
  });
  const result = await model.generateContent(text);
  return result.response.text();
}

// ─── Audio transcription (replaces Whisper) ───────────────────────
export async function transcribeAudio(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent([
    { text: "Transcribe this audio accurately. Output only the transcription text, nothing else." },
    {
      inlineData: {
        mimeType: file.type || "audio/mpeg",
        data: base64,
      },
    },
  ]);
  return result.response.text();
}
