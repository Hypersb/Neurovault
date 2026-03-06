import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function chatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { stream?: boolean; temperature?: number }
) {
  return openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    stream: options?.stream ?? false,
    temperature: options?.temperature ?? 0.7,
    max_tokens: 2048,
  });
}

export async function extractEntities(text: string): Promise<{
  concepts: { name: string; description: string; domain: string }[];
  relationships: { source: string; target: string; type: string }[];
}> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Extract key concepts and relationships from the text. Return JSON only:
{
  "concepts": [{"name": "...", "description": "...", "domain": "..."}],
  "relationships": [{"source": "concept name", "target": "concept name", "type": "relates_to|causes|requires|part_of|example_of"}]
}`,
      },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  try {
    return JSON.parse(response.choices[0].message.content || "{}");
  } catch {
    return { concepts: [], relationships: [] };
  }
}

export async function summarizeText(text: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Summarize the following text concisely, preserving key facts and insights." },
      { role: "user", content: text },
    ],
    temperature: 0.3,
    max_tokens: 512,
  });
  return response.choices[0].message.content || "";
}
