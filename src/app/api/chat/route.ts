import { createServerSupabase } from "@/lib/supabase/server";
import { genAI, createEmbedding, GeminiRateLimitError } from "@/lib/ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

const chatSchema = z.object({
  brainId: z.string().uuid(),
  message: z.string().min(1),
  conversationId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
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
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const msg = Object.entries(fieldErrors)
        .map(([k, v]) => `${k}: ${(v || []).join(", ")}`)
        .join("; ");
      return NextResponse.json({ error: msg || "Invalid request data" }, { status: 400 });
    }

    const { brainId, message, conversationId } = parsed.data;

    // Verify brain ownership
    const { data: brain } = await supabase
      .from("brains")
      .select("*")
      .eq("id", brainId)
      .eq("user_id", user.id)
      .single();

    if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });
    if (brain.is_frozen) return NextResponse.json({ error: "Brain is in legacy mode" }, { status: 403 });

    // Read retrieval settings from brain personality_profile
    const pp = (brain.personality_profile || {}) as Record<string, unknown>;
    const matchCount = typeof pp.topK === "number" ? pp.topK : 8;
    const matchThreshold = typeof pp.confidenceThreshold === "number" ? pp.confidenceThreshold : 0.45;

    // Retrieve relevant memories via similarity search
    let memoryContext = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let retrievedMemories: any[] = [];
    try {
      const queryEmbedding = await createEmbedding(message);
      // Fetch extra candidates for deduplication and re-ranking
      const { data: memories } = await supabase.rpc("match_memories", {
        query_embedding: queryEmbedding,
        match_brain_id: brainId,
        match_threshold: matchThreshold,
        match_count: matchCount + 4,
      });

      if (memories && memories.length > 0) {
        // Deduplicate: remove memories with very similar content (>80% character overlap)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deduped: any[] = [];
        for (const m of memories) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const isDuplicate = deduped.some((existing: any) => {
            const shorter = Math.min(m.content.length, existing.content.length);
            const overlap = m.content.slice(0, shorter) === existing.content.slice(0, shorter);
            return overlap && shorter > 100;
          });
          if (!isDuplicate) deduped.push(m);
        }

        // Re-rank: boost by recency and usage
        const now = Date.now();
        const ranked = deduped.map((m: { similarity: number; last_accessed: string | null; usage_count: number; confidence_score: number }) => {
          const ageDays = m.last_accessed
            ? (now - new Date(m.last_accessed).getTime()) / 86400000
            : 30;
          const recencyBoost = Math.max(0, 0.05 - ageDays * 0.001); // Recent memories get small boost
          const usageBoost = Math.min(0.03, (m.usage_count || 0) * 0.005); // Frequently used memories
          const score = m.similarity + recencyBoost + usageBoost;
          return { ...m, _rankScore: score };
        });
        ranked.sort((a: { _rankScore: number }, b: { _rankScore: number }) => b._rankScore - a._rankScore);

        retrievedMemories = ranked.slice(0, matchCount);
        memoryContext = "\n\nRelevant knowledge from memory:\n" +
          retrievedMemories.map((m: { content: string; confidence_score: number }) =>
            `- [${(m.confidence_score * 100).toFixed(0)}% confidence] ${m.content}`
          ).join("\n");

        // Batch update usage_count and last_accessed
        const nowIso = new Date().toISOString();
        const ids = retrievedMemories.map((m: { id: string }) => m.id);
        if (ids.length > 0) {
          // Update all retrieved memories in parallel
          await Promise.all(
            retrievedMemories.map((m: { id: string; usage_count: number }) =>
              supabase
                .from("memories")
                .update({ usage_count: (m.usage_count || 0) + 1, last_accessed: nowIso })
                .eq("id", m.id)
            )
          );
        }
      }
    } catch (err) {
      logger.warn("Memory retrieval failed, proceeding without context", { error: errMsg(err) });
    }

    // Build personality prompt
    let personalityPrompt = "";
    if (brain.personality_profile && Object.keys(brain.personality_profile).length > 0) {
      personalityPrompt = `\n\nYou are responding with the following personality profile: ${JSON.stringify(brain.personality_profile)}`;
    }

    // Get conversation history
    let history: { role: "user" | "assistant"; content: string }[] = [];
    if (conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("messages")
        .eq("id", conversationId)
        .single();

      if (conv?.messages) {
        history = (conv.messages as { role: "user" | "assistant"; content: string }[]).slice(-20);
      }
    }

    // Build system prompt
    const systemPrompt = memoryContext
      ? `You are NeuroVault, a personalized AI brain assistant. You have been trained on the user's knowledge and respond in their style. Use the retrieved memories to ground your responses in the user's actual knowledge. If the retrieved memories are not directly relevant to the question, you may supplement with your own general knowledge but mention that it comes from general knowledge, not the user's brain.${personalityPrompt}${memoryContext}`
      : `You are NeuroVault, a personalized AI brain assistant. The user's brain has no trained memories relevant to this question, so answer using your general knowledge. Be helpful and informative. Let the user know they can train their brain with documents on the Train page to get more personalized responses.${personalityPrompt}`;

    // Build Gemini contents (convert OpenAI format → Gemini format)
    const geminiContents = [
      ...history.map(msg => ({
        role: msg.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: msg.content }],
      })),
      { role: "user" as const, parts: [{ text: message }] },
    ];

    // Stream response via Gemini
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    });

    let result;
    try {
      result = await model.generateContentStream({ contents: geminiContents });
    } catch (streamErr) {
      if (streamErr instanceof GeminiRateLimitError) {
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          start(controller) {
            const msg = "I'm currently experiencing high demand. Please wait a moment and try again.";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: msg })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return new Response(readable, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      }
      throw streamErr;
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullResponse = "";
        try {
          // Send source citations first
          if (retrievedMemories.length > 0) {
            const sources = retrievedMemories.map((m: { id: string; content: string; source_type: string; confidence_score: number; domain: string | null; similarity: number }) => ({
              id: m.id,
              content: m.content.slice(0, 120),
              source_type: m.source_type,
              confidence: m.confidence_score,
              domain: m.domain,
              similarity: m.similarity,
            }));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`));
          }

          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }

          // Save conversation
          const newMessages = [...history, { role: "user" as const, content: message }, { role: "assistant" as const, content: fullResponse }];

          if (conversationId) {
            await supabase
              .from("conversations")
              .update({ messages: newMessages, updated_at: new Date().toISOString() })
              .eq("id", conversationId);
          } else {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({ brain_id: brainId, title: message.slice(0, 80), messages: newMessages })
              .select("id")
              .single();

            if (newConv) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ conversationId: newConv.id })}\n\n`));
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          logger.error("Stream error", { error: errMsg(err) });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    logger.error("Chat failed", { error: errMsg(err) });
    if (err instanceof GeminiRateLimitError) {
      return NextResponse.json(
        { error: "The AI service is at capacity. Please try again in a few minutes." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

// GET — List conversations for a brain
export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const brainId = searchParams.get("brainId");
    if (!brainId) return NextResponse.json({ error: "brainId required" }, { status: 400 });

    // Verify brain ownership
    const { data: brain } = await supabase
      .from("brains")
      .select("id")
      .eq("id", brainId)
      .eq("user_id", user.id)
      .single();
    if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, title, updated_at, messages")
      .eq("brain_id", brainId)
      .order("updated_at", { ascending: false })
      .limit(20);

    return NextResponse.json(conversations || []);
  } catch (err) {
    logger.error("Failed to fetch conversations", { error: errMsg(err) });
    return NextResponse.json([], { status: 200 });
  }
}
