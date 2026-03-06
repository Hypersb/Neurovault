import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

const createBrainSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

async function ensureProfile(supabase: ReturnType<typeof createServerSupabase>, user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const fullName = (user.user_metadata?.full_name as string) || "";
    await supabase
      .from("profiles")
      .insert({ id: user.id, email: user.email || "", full_name: fullName });
  }
}

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Ensure profile exists (handles users who signed up before migration)
    await ensureProfile(supabase, user);

    const { data: brains, error } = await supabase
      .from("brains")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    // Auto-create a default brain if none exist
    if (!brains || brains.length === 0) {
      const { data: newBrain, error: createError } = await supabase
        .from("brains")
        .insert({ user_id: user.id, name: "My First Brain", description: "Your default AI brain" })
        .select()
        .single();

      if (createError) throw new Error(createError.message);
      return NextResponse.json([newBrain]);
    }

    return NextResponse.json(brains);
  } catch (err) {
    logger.error("Failed to fetch brains", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = createBrainSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { data: brain, error } = await supabase
      .from("brains")
      .insert({ user_id: user.id, ...parsed.data })
      .select()
      .single();

    if (error) throw new Error(error.message);

    logger.info("Brain created", { brainId: brain.id, userId: user.id });
    return NextResponse.json(brain, { status: 201 });
  } catch (err) {
    logger.error("Failed to create brain", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, name, personality_profile, is_frozen } = body;
    if (!id) return NextResponse.json({ error: "Brain id required" }, { status: 400 });

    const { data: brain } = await supabase
      .from("brains").select("id").eq("id", id).eq("user_id", user.id).single();
    if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (personality_profile !== undefined) updates.personality_profile = personality_profile;
    if (is_frozen !== undefined) updates.is_frozen = is_frozen;

    const { data, error } = await supabase
      .from("brains").update(updates).eq("id", id).select().single();
    if (error) throw new Error(error.message);

    logger.info("Brain updated", { brainId: id, userId: user.id });
    return NextResponse.json(data);
  } catch (err) {
    logger.error("Failed to update brain", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Brain id required" }, { status: 400 });

    // Verify ownership
    const { data: brain } = await supabase
      .from("brains")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

    // Count remaining brains
    const { count } = await supabase
      .from("brains")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count || 0) <= 1) {
      return NextResponse.json({ error: "Cannot delete your last brain" }, { status: 400 });
    }

    // Delete cascades: memories, concepts, relationships, training_jobs, conversations, snapshots
    const { error } = await supabase.from("brains").delete().eq("id", id);
    if (error) throw new Error(error.message);

    logger.info("Brain deleted", { brainId: id, userId: user.id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Failed to delete brain", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}
