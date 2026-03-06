import { createServerSupabase } from "@/lib/supabase/server";
import { createEmbedding, extractEntities, summarizeText, transcribeAudio, genAI } from "@/lib/ai";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Allow up to 60s for training (Vercel Pro: 300s max)
export const maxDuration = 60;

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  // PDF
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const buffer = Buffer.from(await file.arrayBuffer());
      const data = await pdfParse(buffer);
      return data.text;
    } catch (err) {
      logger.warn("pdf-parse failed, trying raw text extraction", { error: errMsg(err) });
      // Fallback: try to extract raw text from the buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      const rawText = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
      if (rawText.length > 50) return rawText;
      throw new Error("Could not extract text from PDF. The file may be scanned or image-based.");
    }
  }

  // Audio — transcribe with Gemini
  if (file.type.startsWith("audio/") || [".mp3", ".wav", ".m4a", ".ogg", ".webm"].some(ext => name.endsWith(ext))) {
    return transcribeAudio(file);
  }

  // Text / Markdown / other
  return file.text();
}

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const brainId = formData.get("brainId") as string;

    if (!file || !brainId) {
      return NextResponse.json({ error: "File and brainId required" }, { status: 400 });
    }

    // Verify brain ownership
    const { data: brain } = await supabase
      .from("brains")
      .select("id")
      .eq("id", brainId)
      .eq("user_id", user.id)
      .single();

    if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

    // Create training job
    const { data: job, error: jobError } = await supabase
      .from("training_jobs")
      .insert({
        brain_id: brainId,
        file_name: file.name,
        file_type: file.type || file.name.split(".").pop() || "unknown",
        file_size: `${(file.size / 1024).toFixed(0)} KB`,
        status: "parsing",
        progress: 10,
        stage: "Parsing document\u2026",
      })
      .select()
      .single();

    if (jobError) throw new Error(jobError.message);

    // Process synchronously — Vercel serverless kills background tasks after response
    try {
      await processFile(supabase, file, brainId, job.id);
    } catch (err) {
      logger.error("Training pipeline failed", { error: errMsg(err), jobId: job.id });
    }

    // Return the final job state
    const { data: finalJob } = await supabase
      .from("training_jobs")
      .select("*")
      .eq("id", job.id)
      .single();

    return NextResponse.json(finalJob || job, { status: 201 });
  } catch (err) {
    logger.error("Training upload failed", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const brainId = searchParams.get("brainId");
    if (!brainId) return NextResponse.json({ error: "brainId required" }, { status: 400 });

    const { data: jobs, error } = await supabase
      .from("training_jobs")
      .select("*")
      .eq("brain_id", brainId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.warn("Failed to fetch training jobs", { error: error.message });
      // Return empty array instead of 500 — table may not exist or RLS may block
      return NextResponse.json([]);
    }
    return NextResponse.json(jobs || []);
  } catch (err) {
    logger.error("Failed to fetch jobs", { error: errMsg(err) });
    // Return empty array to prevent client-side error loops from polling
    return NextResponse.json([]);
  }
}

// PUT — Conversational training: AI responds like ChatGPT AND stores knowledge as memories
export async function PUT(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { brainId, message, history } = body;
    if (!brainId || !message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "brainId and message required" }, { status: 400 });
    }

    // Verify brain ownership
    const { data: brain } = await supabase
      .from("brains")
      .select("id, version")
      .eq("id", brainId)
      .eq("user_id", user.id)
      .single();
    if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

    const text = message.trim();

    // Store user message as memory (train the brain)
    let stored = false;
    let conceptsCreated = 0;
    if (text.length >= 5) {
      try {
        const embedding = await createEmbedding(text);
        const domain = getDomain(text);

        await supabase.from("memories").insert({
          brain_id: brainId,
          content: text,
          embedding,
          source_type: "chat",
          confidence_score: 0.85,
          domain,
          tags: [],
          metadata: { source: "chat_training" },
        });
        stored = true;

        // Extract entities if text is substantial
        if (text.length > 50) {
          try {
            const { concepts, relationships } = await extractEntities(text);
            for (const concept of concepts) {
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
            for (const rel of relationships) {
              const { data: source } = await supabase.from("concepts").select("id").eq("brain_id", brainId).eq("name", rel.source).single();
              const { data: target } = await supabase.from("concepts").select("id").eq("brain_id", brainId).eq("name", rel.target).single();
              if (source && target) {
                await supabase.from("relationships").insert({
                  brain_id: brainId, source_concept_id: source.id, target_concept_id: target.id,
                  relationship_type: rel.type, strength: 0.6,
                });
              }
            }
          } catch (err) {
            logger.warn("Entity extraction failed for chat training", { error: errMsg(err) });
          }
        }

        // Increment brain version
        await supabase
          .from("brains")
          .update({ version: (brain.version || 1) + 1, updated_at: new Date().toISOString() })
          .eq("id", brainId);
      } catch (err) {
        logger.warn("Failed to store memory during chat training", { error: errMsg(err) });
      }
    }

    // Generate AI response
    const chatHistory = Array.isArray(history) ? history.slice(-20) : [];
    const systemPrompt = `You are NeuroVault's training assistant. The user is teaching their AI brain by chatting with you. Your job is to:
1. Respond naturally and helpfully to whatever the user says
2. If the user shares knowledge or facts, acknowledge what you learned and ask follow-up questions to extract more knowledge
3. If the user asks questions, answer them using your general knowledge
4. Encourage the user to share more details, examples, and context — the more they share, the smarter their brain gets
5. Be conversational, friendly, and concise

${stored ? `[System: The user's message was stored as a memory in their brain${conceptsCreated > 0 ? ` and ${conceptsCreated} new concept${conceptsCreated > 1 ? "s were" : " was"} extracted` : ""}.] ` : ""}`;

    // Build Gemini contents
    const geminiContents = [
      ...chatHistory.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: m.content }],
      })),
      { role: "user" as const, parts: [{ text }] },
    ];

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    });

    const completion = await model.generateContent({ contents: geminiContents });
    const reply = completion.response.text() || "I got that stored in your brain!";

    return NextResponse.json({ reply, stored, conceptsCreated });
  } catch (err) {
    logger.error("Chat training failed", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processFile(supabase: any, file: File, brainId: string, jobId: string) {
  try {
    // Step 1: Parse
    const text = await extractTextFromFile(file);
    if (!text || text.trim().length < 10) {
      await updateJob(supabase, jobId, "error", 0, "Failed", 0, 0, "Could not extract text from file");
      return;
    }
    await updateJob(supabase, jobId, "parsing", 20, "Parsing document\u2026");

    // Step 2: Chunk text
    const chunks = chunkText(text, 1000, 200);
    await updateJob(supabase, jobId, "embedding", 40, "Generating embeddings\u2026");

    // Step 3: Embed and store
    let memoriesCreated = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await createEmbedding(chunks[i]);

        // Determine domain from content
        const domain = getDomain(chunks[i]);

        await supabase.from("memories").insert({
          brain_id: brainId,
          content: chunks[i],
          embedding,
          source_type: file.name.endsWith(".pdf") ? "pdf" : file.name.endsWith(".mp3") || file.name.endsWith(".wav") ? "audio" : "text",
          confidence_score: 0.8,
          domain,
          tags: [],
          metadata: { file_name: file.name, chunk_index: i },
        });
        memoriesCreated++;
      } catch (err) {
        logger.warn("Failed to embed chunk", { error: errMsg(err), chunkIndex: i });
      }

      const progress = 40 + Math.round((i / chunks.length) * 25);
      await updateJob(supabase, jobId, "embedding", progress, "Generating embeddings\u2026");
    }

    // Step 4: Extract entities
    await updateJob(supabase, jobId, "extracting", 70, "Extracting entities\u2026");

    let conceptsCreated = 0;
    // Process a summary of the full text for entity extraction
    const summaryForExtraction = text.length > 8000 ? await summarizeText(text.slice(0, 8000)) : text.slice(0, 4000);
    const { concepts, relationships } = await extractEntities(summaryForExtraction);

    for (const concept of concepts) {
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

    // Step 5: Build graph relationships
    await updateJob(supabase, jobId, "graph", 90, "Updating knowledge graph\u2026");

    for (const rel of relationships) {
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

    // Done
    await updateJob(supabase, jobId, "done", 100, "Completed", memoriesCreated, conceptsCreated);

    // Increment brain version
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
    logger.error("Training pipeline error", { error: errMsg(err), jobId });
    await updateJob(supabase, jobId, "error", 0, "Failed", 0, 0, errMsg(err));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateJob(supabase: any, jobId: string, status: string, progress: number, stage: string, memoriesCreated?: number, conceptsCreated?: number, errorMessage?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { status, progress, stage, updated_at: new Date().toISOString() };
  if (memoriesCreated !== undefined) update.memories_created = memoriesCreated;
  if (conceptsCreated !== undefined) update.concepts_created = conceptsCreated;
  if (errorMessage) update.error_message = errorMessage;
  await supabase.from("training_jobs").update(update).eq("id", jobId);
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start += chunkSize - overlap;
  }
  return chunks;
}

function getDomain(text: string): string {
  const domains: Record<string, string[]> = {
    "Machine Learning": ["neural", "model", "training", "gradient", "loss", "epoch", "transformer", "attention", "embedding", "backprop"],
    "Systems Design": ["server", "database", "cache", "load balancer", "distributed", "latency", "throughput", "microservice", "API"],
    "Mathematics": ["theorem", "proof", "equation", "integral", "derivative", "matrix", "vector", "probability"],
    "Philosophy": ["ethics", "epistemology", "ontology", "consciousness", "morality", "existence", "metaphysics"],
    "Programming": ["function", "variable", "class", "algorithm", "data structure", "array", "loop", "recursion"],
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
