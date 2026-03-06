import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

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

    if (error) throw error;

    // Auto-create a default brain if none exist
    if (!brains || brains.length === 0) {
      const { data: newBrain, error: createError } = await supabase
        .from("brains")
        .insert({ user_id: user.id, name: "My First Brain", description: "Your default AI brain" })
        .select()
        .single();

      if (createError) throw createError;
      return NextResponse.json([newBrain]);
    }

    return NextResponse.json(brains);
  } catch (err) {
    logger.error("Failed to fetch brains", { error: String(err) });
    return NextResponse.json({ error: "Failed to fetch brains" }, { status: 500 });
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

    if (error) throw error;

    logger.info("Brain created", { brainId: brain.id, userId: user.id });
    return NextResponse.json(brain, { status: 201 });
  } catch (err) {
    logger.error("Failed to create brain", { error: String(err) });
    return NextResponse.json({ error: "Failed to create brain" }, { status: 500 });
  }
}
