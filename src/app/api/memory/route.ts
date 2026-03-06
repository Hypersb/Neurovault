import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

const querySchema = z.object({
  brainId: z.string().uuid(),
  query: z.string().optional(),
  domain: z.string().optional(),
  sort: z.enum(["confidence", "usage", "recent"]).default("confidence"),
  limit: z.number().min(1).max(100).default(50),
});

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = querySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const { brainId, query, domain, sort, limit } = parsed.data;

    let q = supabase
      .from("memories")
      .select("*")
      .eq("brain_id", brainId);

    if (query) q = q.ilike("content", `%${query}%`);
    if (domain && domain !== "all") q = q.eq("domain", domain);

    if (sort === "confidence") q = q.order("confidence_score", { ascending: false });
    else if (sort === "usage") q = q.order("usage_count", { ascending: false });
    else q = q.order("created_at", { ascending: false });

    q = q.limit(limit);

    const { data: memories, error } = await q;
    if (error) throw new Error(error.message);

    // Get unique domains for filter
    const { data: domains } = await supabase
      .from("memories")
      .select("domain")
      .eq("brain_id", brainId)
      .not("domain", "is", null);

    const uniqueDomains = Array.from(new Set((domains || []).map((d: { domain: string }) => d.domain)));

    // Get total count
    const { count } = await supabase
      .from("memories")
      .select("*", { count: "exact", head: true })
      .eq("brain_id", brainId);

    return NextResponse.json({ memories: memories || [], domains: uniqueDomains, total: count || 0 });
  } catch (err) {
    logger.error("Failed to fetch memories", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Memory id required" }, { status: 400 });

    // Verify the memory belongs to a brain owned by this user
    const { data: memory } = await supabase
      .from("memories")
      .select("brain_id")
      .eq("id", id)
      .single();
    if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

    const { data: brain } = await supabase
      .from("brains")
      .select("id")
      .eq("id", memory.brain_id)
      .eq("user_id", user.id)
      .single();
    if (!brain) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { error } = await supabase.from("memories").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Failed to delete memory", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}
