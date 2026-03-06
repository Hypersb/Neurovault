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

    // Memory stats
    const { count: memoryCount } = await supabase
      .from("memories")
      .select("*", { count: "exact", head: true })
      .eq("brain_id", brainId);

    // Concept stats
    const { count: conceptCount } = await supabase
      .from("concepts")
      .select("*", { count: "exact", head: true })
      .eq("brain_id", brainId);

    // Relationship stats
    const { count: relationshipCount } = await supabase
      .from("relationships")
      .select("*", { count: "exact", head: true })
      .eq("brain_id", brainId);

    // Confidence distribution
    const { data: memories } = await supabase
      .from("memories")
      .select("confidence_score, domain, source_type, created_at")
      .eq("brain_id", brainId);

    const high = (memories || []).filter((m: { confidence_score: number }) => m.confidence_score >= 0.85).length;
    const medium = (memories || []).filter((m: { confidence_score: number }) => m.confidence_score >= 0.65 && m.confidence_score < 0.85).length;
    const low = (memories || []).filter((m: { confidence_score: number }) => m.confidence_score < 0.65).length;

    // Domain distribution
    const domainCounts: Record<string, number> = {};
    (memories || []).forEach((m: { domain: string | null }) => {
      const d = m.domain || "General";
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    });

    const domains = Object.entries(domainCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Training jobs
    const { data: jobs } = await supabase
      .from("training_jobs")
      .select("*")
      .eq("brain_id", brainId)
      .order("created_at", { ascending: false })
      .limit(10);

    const completedJobs = (jobs || []).filter((j: { status: string }) => j.status === "done").length;
    const totalJobs = (jobs || []).length;

    // Brain info
    const { data: brain } = await supabase
      .from("brains")
      .select("version, created_at, updated_at, is_frozen, name")
      .eq("id", brainId)
      .single();

    // Snapshots
    const { data: snapshots } = await supabase
      .from("brain_snapshots")
      .select("id, version, label, created_at")
      .eq("brain_id", brainId)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      memoryCount: memoryCount || 0,
      conceptCount: conceptCount || 0,
      relationshipCount: relationshipCount || 0,
      confidenceDistribution: { high, medium, low },
      domains,
      trainingProgress: { completed: completedJobs, total: totalJobs },
      brain: brain || {},
      snapshots: snapshots || [],
      recentJobs: jobs || [],
    });
  } catch (err) {
    logger.error("Failed to fetch health", { error: String(err) });
    return NextResponse.json({ error: "Failed to fetch health" }, { status: 500 });
  }
}
