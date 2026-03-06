import { createServerSupabase } from "@/lib/supabase/server";
import { openai, createEmbedding } from "@/lib/openai";
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
  conversationId: z.string().uuid().optional(),
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
    const matchCount = typeof pp.topK === "number" ? pp.topK : 6;
    const matchThreshold = typeof pp.confidenceThreshold === "number" ? pp.confidenceThreshold : 0.5;

    // Retrieve relevant memories via similarity search
    let memoryContext = "";
    try {
      const queryEmbedding = await createEmbedding(message);
      const { data: memories } = await supabase.rpc("match_memories", {
        query_embedding: queryEmbedding,
        match_brain_id: brainId,
        match_threshold: matchThreshold,
        match_count: matchCount,
      });

      if (memories && memories.length > 0) {
        memoryContext = "\n\nRelevant knowledge from memory:\n" +
          memories.map((m: { content: string; confidence_score: number }) =>
            `- [${(m.confidence_score * 100).toFixed(0)}% confidence] ${m.content}`
          ).join("\n");

        // Update usage_count and last_accessed for each memory individually
        const now = new Date().toISOString();
        for (const m of memories) {
          await supabase
            .from("memories")
            .update({ usage_count: (m.usage_count || 0) + 1, last_accessed: now })
            .eq("id", m.id);
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

    // Build messages
    const systemPrompt = memoryContext
      ? `You are NeuroVault, a personalized AI brain assistant. You have been trained on the user's knowledge and respond in their style. Use the retrieved memories to ground your responses in the user's actual knowledge. If the retrieved memories are not directly relevant to the question, you may supplement with your own general knowledge but mention that it comes from general knowledge, not the user's brain.${personalityPrompt}${memoryContext}`
      : `You are NeuroVault, a personalized AI brain assistant. The user's brain has no trained memories relevant to this question, so answer using your general knowledge. Be helpful and informative. Let the user know they can train their brain with documents on the Train page to get more personalized responses.${personalityPrompt}`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    // Stream response
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2048,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullResponse = "";
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || "";
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
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}
