import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const brainId = searchParams.get("brainId");
    if (!brainId) return NextResponse.json({ error: "brainId required" }, { status: 400 });

    // Fetch concepts
    const { data: concepts, error: cErr } = await supabase
      .from("concepts")
      .select("*")
      .eq("brain_id", brainId)
      .order("importance_score", { ascending: false });

    if (cErr) throw cErr;

    // Fetch relationships
    const { data: relationships, error: rErr } = await supabase
      .from("relationships")
      .select("*")
      .eq("brain_id", brainId);

    if (rErr) throw rErr;

    return NextResponse.json({
      concepts: concepts || [],
      relationships: relationships || [],
    });
  } catch (err) {
    logger.error("Failed to fetch graph", { error: String(err) });
    return NextResponse.json({ error: "Failed to fetch graph" }, { status: 500 });
  }
}
