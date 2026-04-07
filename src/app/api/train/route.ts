import { createServerSupabase } from "@/lib/supabase/server";
import { createEmbedding } from "@/lib/ai";
import { getDomain, updateTrainingJob } from "@/lib/training/processor";
import { buildTrainingStoragePath, TRAINING_FILES_BUCKET } from "@/lib/training/queue";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Allow up to 60s for training (Vercel Pro: 300s max)
export const maxDuration = 60;

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md", "mp3", "wav", "m4a", "ogg", "webm"]);

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
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

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json({ error: "File is too large. Max size is 50 MB." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
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
        status: "pending",
        progress: 0,
        stage: "Queued",
      })
      .select()
      .single();

    if (jobError) throw new Error(jobError.message);

    const filePath = buildTrainingStoragePath({
      userId: user.id,
      brainId,
      jobId: job.id,
      fileName: file.name,
    });

    const { error: uploadError } = await supabase.storage
      .from(TRAINING_FILES_BUCKET)
      .upload(filePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      await updateTrainingJob(supabase, {
        jobId: job.id,
        status: "error",
        progress: 0,
        stage: "Failed",
        errorMessage: "Failed to store training file",
      });
      throw new Error(uploadError.message);
    }

    // Best effort nudge so users do not always wait for cron.
    try {
      const workerSecret = process.env.TRAINING_WORKER_SECRET || process.env.CRON_SECRET;
      if (workerSecret) {
        await fetch(new URL("/api/train/worker", request.url), {
          method: "POST",
          headers: { Authorization: `Bearer ${workerSecret}` },
        });
      }
    } catch (err) {
      logger.warn("Worker trigger failed", { error: errMsg(err), jobId: job.id });
    }

    return NextResponse.json(job, { status: 201 });
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
    const { brainId, message } = body;
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

        // Increment brain version
        await supabase
          .from("brains")
          .update({ version: (brain.version || 1) + 1, updated_at: new Date().toISOString() })
          .eq("id", brainId);
      } catch (err) {
        logger.warn("Failed to store memory during chat training", { error: errMsg(err) });
      }
    }

    const reply = stored
      ? "Stored in memory. Use Chat to ask follow-up questions with retrieval and citations."
      : "Message received, but it was too short to store as training memory.";

    return NextResponse.json({ reply, stored, conceptsCreated: 0 });
  } catch (err) {
    logger.error("Chat training failed", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}
