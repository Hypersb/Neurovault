import {
  createEmbeddingsBatch,
  extractEntities,
  summarizeText,
  transcribeAudio,
  GeminiRateLimitError,
  assertEmbeddingDimensions,
} from "@/lib/ai";
import { logger } from "@/lib/logger";
import { createAdminSupabase } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createAdminSupabase>;

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const pdfParse = await import("pdf-parse");
      const parse = (pdfParse as unknown as { default?: (buffer: Buffer) => Promise<{ text: string }> }).default;
      const parser = parse ?? (pdfParse as unknown as (buffer: Buffer) => Promise<{ text: string }>);
      const buffer = Buffer.from(await file.arrayBuffer());
      const data = await parser(buffer);
      return data.text;
    } catch (err) {
      logger.warn("pdf-parse failed, trying raw text extraction", { error: errMsg(err) });
      const buffer = Buffer.from(await file.arrayBuffer());
      const rawText = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
      if (rawText.length > 50) return rawText;
      throw new Error("Could not extract text from PDF. The file may be scanned or image-based.");
    }
  }

  if (file.type.startsWith("audio/") || [".mp3", ".wav", ".m4a", ".ogg", ".webm"].some((ext) => name.endsWith(ext))) {
    return transcribeAudio(file);
  }

  return file.text();
}

export async function updateTrainingJob(
  supabase: SupabaseClient,
  params: {
    jobId: string;
    status: string;
    progress: number;
    stage: string;
    memoriesCreated?: number;
    conceptsCreated?: number;
    errorMessage?: string;
  }
): Promise<void> {
  const update: {
    status: string;
    progress: number;
    stage: string;
    updated_at: string;
    memories_created?: number;
    concepts_created?: number;
    error_message?: string;
  } = {
    status: params.status,
    progress: params.progress,
    stage: params.stage,
    updated_at: new Date().toISOString(),
  };

  if (params.memoriesCreated !== undefined) update.memories_created = params.memoriesCreated;
  if (params.conceptsCreated !== undefined) update.concepts_created = params.conceptsCreated;
  if (params.errorMessage !== undefined) update.error_message = params.errorMessage;

  await supabase.from("training_jobs").update(update).eq("id", params.jobId);
}

export async function processTrainingFile(params: {
  supabase: SupabaseClient;
  file: File;
  brainId: string;
  jobId: string;
}): Promise<void> {
  const { supabase, file, brainId, jobId } = params;

  try {
    const text = await extractTextFromFile(file);
    if (!text || text.trim().length < 10) {
      await updateTrainingJob(supabase, {
        jobId,
        status: "error",
        progress: 0,
        stage: "Failed",
        memoriesCreated: 0,
        conceptsCreated: 0,
        errorMessage: "Could not extract text from file",
      });
      return;
    }

    await updateTrainingJob(supabase, {
      jobId,
      status: "parsing",
      progress: 20,
      stage: "Parsing document...",
    });

    const chunks = chunkText(text, 1000, 200);
    await updateTrainingJob(supabase, {
      jobId,
      status: "embedding",
      progress: 40,
      stage: "Generating embeddings...",
    });

    let memoriesCreated = 0;
    const embedBatchSize = 10;
    const lowerName = file.name.toLowerCase();
    const sourceType = lowerName.endsWith(".pdf")
      ? "pdf"
      : lowerName.endsWith(".mp3") || lowerName.endsWith(".wav")
      ? "audio"
      : "text";

    for (let i = 0; i < chunks.length; i += embedBatchSize) {
      const batchTexts = chunks.slice(i, i + embedBatchSize);

      try {
        const embeddings = await createEmbeddingsBatch(batchTexts);

        for (let j = 0; j < batchTexts.length; j++) {
          const chunkIndex = i + j;
          const domain = getDomain(batchTexts[j]);
          const confidence = scoreChunkConfidence(batchTexts[j]);
          assertEmbeddingDimensions(embeddings[j], `processTrainingFile chunk ${chunkIndex}`);

          await supabase.from("memories").insert({
            brain_id: brainId,
            content: batchTexts[j],
            embedding: embeddings[j],
            source_type: sourceType,
            confidence_score: confidence,
            domain,
            tags: [],
            metadata: { file_name: file.name, chunk_index: chunkIndex, total_chunks: chunks.length },
          });
          memoriesCreated++;
        }
      } catch (err) {
        logger.warn("Failed to embed batch", { error: errMsg(err), batchStart: i, batchSize: batchTexts.length });
      }

      const progress = 40 + Math.round((Math.min(i + embedBatchSize, chunks.length) / chunks.length) * 25);
      await updateTrainingJob(supabase, {
        jobId,
        status: "embedding",
        progress,
        stage: "Generating embeddings...",
      });
    }

    await updateTrainingJob(supabase, {
      jobId,
      status: "extracting",
      progress: 70,
      stage: "Extracting entities...",
    });

    let conceptsCreated = 0;
    const windowSize = 6000;
    const allConcepts: { name: string; description: string; domain: string }[] = [];
    const allRelationships: { source: string; target: string; type: string }[] = [];

    try {
      if (text.length <= windowSize) {
        const extracted = await extractEntities(text);
        allConcepts.push(...extracted.concepts);
        allRelationships.push(...extracted.relationships);
      } else {
        const windowCount = Math.min(Math.ceil(text.length / windowSize), 5);
        for (let w = 0; w < windowCount; w++) {
          if (w > 0) await new Promise((r) => setTimeout(r, 1500));

          const start = w * windowSize;
          const windowText = text.slice(start, start + windowSize);
          try {
            const summary = await summarizeText(windowText);
            await new Promise((r) => setTimeout(r, 500));
            const extracted = await extractEntities(summary);
            allConcepts.push(...extracted.concepts);
            allRelationships.push(...extracted.relationships);
          } catch (err) {
            logger.warn("Entity extraction failed for window", { window: w, error: errMsg(err) });
          }
        }
      }
    } catch (err) {
      logger.warn("Entity extraction failed", { error: errMsg(err) });
    }

    const conceptMap = new Map<string, { name: string; description: string; domain: string }>();
    for (const c of allConcepts) {
      const key = c.name.toLowerCase().trim();
      if (!conceptMap.has(key)) conceptMap.set(key, c);
    }

    for (const concept of Array.from(conceptMap.values())) {
      const { data: existing } = await supabase
        .from("concepts")
        .select("id")
        .eq("brain_id", brainId)
        .eq("name", concept.name)
        .single();

      if (!existing) {
        await supabase.from("concepts").insert({
          brain_id: brainId,
          name: concept.name,
          description: concept.description,
          domain: concept.domain,
          importance_score: 0.6,
        });
        conceptsCreated++;
      }
    }

    await updateTrainingJob(supabase, {
      jobId,
      status: "graph",
      progress: 90,
      stage: "Updating knowledge graph...",
    });

    const relSet = new Set<string>();
    for (const rel of allRelationships) {
      const key = `${rel.source.toLowerCase()}|${rel.target.toLowerCase()}|${rel.type}`;
      if (relSet.has(key)) continue;
      relSet.add(key);

      const { data: source } = await supabase
        .from("concepts")
        .select("id")
        .eq("brain_id", brainId)
        .eq("name", rel.source)
        .single();

      const { data: target } = await supabase
        .from("concepts")
        .select("id")
        .eq("brain_id", brainId)
        .eq("name", rel.target)
        .single();

      if (source && target) {
        await supabase.from("relationships").insert({
          brain_id: brainId,
          source_concept_id: source.id,
          target_concept_id: target.id,
          relationship_type: rel.type,
          strength: 0.6,
        });
      }
    }

    await updateTrainingJob(supabase, {
      jobId,
      status: "done",
      progress: 100,
      stage: "Completed",
      memoriesCreated,
      conceptsCreated,
    });

    const { data: currentBrain } = await supabase
      .from("brains")
      .select("version")
      .eq("id", brainId)
      .single();

    await supabase
      .from("brains")
      .update({ version: (currentBrain?.version || 1) + 1, updated_at: new Date().toISOString() })
      .eq("id", brainId);

    logger.info("Training complete", { jobId, memoriesCreated, conceptsCreated });
  } catch (err) {
    const isRateLimit = err instanceof GeminiRateLimitError;
    const message = isRateLimit
      ? "Training paused due to AI rate limits. Please try again later."
      : errMsg(err);

    logger.error("Training pipeline error", { error: errMsg(err), jobId, isRateLimit });
    await updateTrainingJob(supabase, {
      jobId,
      status: "error",
      progress: 0,
      stage: "Failed",
      memoriesCreated: 0,
      conceptsCreated: 0,
      errorMessage: message,
    });
  }
}

export function chunkText(text: string, targetSize: number, overlap: number): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";
  let overlapBuffer = "";

  for (const sentence of sentences) {
    const trimSentence = sentence.trim();
    if (!trimSentence) continue;

    if (currentChunk.length + trimSentence.length > targetSize && currentChunk.length > 0) {
      const finalChunk = currentChunk.trim();
      if (finalChunk.length > 50) chunks.push(finalChunk);

      const words = currentChunk.split(/\s+/);
      const overlapWords: string[] = [];
      let overlapLen = 0;
      for (let i = words.length - 1; i >= 0 && overlapLen < overlap; i--) {
        overlapWords.unshift(words[i]);
        overlapLen += words[i].length + 1;
      }
      overlapBuffer = overlapWords.join(" ");

      currentChunk = overlapBuffer + " " + trimSentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + trimSentence;
    }
  }

  const last = currentChunk.trim();
  if (last.length > 50) chunks.push(last);

  return chunks;
}

export function getDomain(text: string): string {
  const domains: Record<string, string[]> = {
    "Machine Learning": ["neural", "model", "training", "gradient", "loss", "epoch", "transformer", "attention", "embedding", "backprop", "deep learning", "classification", "regression", "overfitting", "dataset", "batch"],
    "Systems Design": ["server", "database", "cache", "load balancer", "distributed", "latency", "throughput", "microservice", "api", "scalability", "replication", "sharding", "kubernetes", "docker"],
    "Mathematics": ["theorem", "proof", "equation", "integral", "derivative", "matrix", "vector", "probability", "calculus", "algebra", "topology", "statistics", "regression", "convergence"],
    "Philosophy": ["ethics", "epistemology", "ontology", "consciousness", "morality", "existence", "metaphysics", "phenomenology", "existentialism", "determinism"],
    "Programming": ["function", "variable", "class", "algorithm", "data structure", "array", "loop", "recursion", "compiler", "runtime", "syntax", "debugging", "refactor", "typescript", "python", "javascript"],
    "Science": ["experiment", "hypothesis", "particle", "molecule", "chemical", "biology", "physics", "evolution", "genome", "quantum", "relativity", "entropy", "organism"],
    "History": ["century", "war", "empire", "civilization", "revolution", "dynasty", "colony", "treaty", "ancient", "medieval", "political", "independence"],
    "Business": ["revenue", "market", "startup", "investor", "profit", "strategy", "customer", "product", "growth", "acquisition", "valuation", "equity"],
    "Medicine": ["diagnosis", "treatment", "patient", "symptom", "disease", "clinical", "therapy", "pharmaceutical", "surgery", "pathology", "chronic", "vaccine"],
    "Law": ["statute", "regulation", "contract", "court", "jurisdiction", "plaintiff", "defendant", "constitutional", "precedent", "litigation"],
    "Psychology": ["cognitive", "behavioral", "emotion", "perception", "memory", "motivation", "disorder", "therapy", "personality", "subconscious"],
    "Cybersecurity": ["vulnerability", "exploit", "encryption", "firewall", "malware", "authentication", "penetration", "phishing", "threat", "breach", "ransomware", "zero-day"],
  };

  const lower = text.toLowerCase();
  let bestDomain = "General";
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(domains)) {
    const score = keywords.filter((k) => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

export function scoreChunkConfidence(chunk: string): number {
  let score = 0.7;

  const words = chunk.split(/\s+/).length;
  const sentences = (chunk.match(/[.!?]+/g) || []).length;

  if (words > 80) score += 0.05;
  if (words > 150) score += 0.05;

  if (sentences >= 3) score += 0.05;
  if (sentences >= 6) score += 0.03;

  if (words < 20) score -= 0.15;
  else if (words < 40) score -= 0.05;

  const alphaRatio = (chunk.match(/[a-zA-Z]/g) || []).length / chunk.length;
  if (alphaRatio < 0.5) score -= 0.1;

  const domain = getDomain(chunk);
  if (domain !== "General") score += 0.05;

  return Math.max(0.5, Math.min(0.95, Math.round(score * 100) / 100));
}
