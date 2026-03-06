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

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
