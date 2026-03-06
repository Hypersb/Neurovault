"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, Brain, TrendingUp, AlertCircle,
  CheckCircle2, Archive, Download, Trash2,
  Zap, Database, GitBranch, Sparkles, Loader2,
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from "recharts";
import { useBrainContext, useBrainHealth, useDeleteBrain, useUpdateBrain } from "@/lib/hooks";
import { PageError } from "@/components/ui/page-error";

const fade = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

const severityColor: Record<string, string> = {
  high:   "text-red-400 bg-red-400/10 border-red-400/20",
  medium: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  low:    "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
};

export default function HealthPage() {
  const router = useRouter();
  const { activeBrainId, brains } = useBrainContext();
  const { data: health, isLoading, error, refetch } = useBrainHealth(activeBrainId);
  const deleteBrain = useDeleteBrain();
  const updateBrain = useUpdateBrain();
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (error) return <PageError message={error instanceof Error ? error.message : String(error)} onRetry={() => refetch()} />;

  if (isLoading || !health) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const memoryCount = health.memoryCount || 0;
  const conceptCount = health.conceptCount || 0;
  const relationshipCount = health.relationshipCount || 0;
  const conf = health.confidenceDistribution || { high: 0, medium: 0, low: 0 };
  const totalConf = conf.high + conf.medium + conf.low;
  const avgConfidence = totalConf > 0 ? Math.round(((conf.high * 92 + conf.medium * 75 + conf.low * 40) / totalConf)) : 0;
  const lowPct = totalConf > 0 ? Math.round((conf.low / totalConf) * 100) : 0;
  const domainCount = (health.domains || []).length;

  const radarData = [
    { metric: "Memory depth",    score: Math.min(100, Math.round(memoryCount / 2)) },
    { metric: "Concept density", score: memoryCount > 0 ? Math.min(100, Math.round((conceptCount / memoryCount) * 100)) : 0 },
    { metric: "Consistency",     score: avgConfidence },
    { metric: "Coverage",        score: Math.min(100, domainCount * 15) },
    { metric: "Connections",     score: conceptCount > 0 ? Math.min(100, Math.round((relationshipCount / conceptCount) * 50)) : 0 },
    { metric: "Training",        score: (health.trainingProgress?.total || 0) > 0 ? Math.round(((health.trainingProgress?.completed || 0) / health.trainingProgress.total) * 100) : 0 },
  ];

  const overallScore = Math.round(radarData.reduce((sum, d) => sum + d.score, 0) / radarData.length);
  const isHealthy = overallScore >= 50;
  const isFrozen = health.brain?.is_frozen === true;

  const brainName = health.brain?.name || "Brain";
  const brainVersion = health.brain?.version || 1;
  const updatedAt = health.brain?.updated_at ? new Date(health.brain.updated_at) : null;
  const lastUpdatedLabel = updatedAt ? formatRelativeTime(updatedAt) : "never";

  const snapshots = (health.snapshots || []).map((s: { id: string; version: number; label: string; created_at: string }, i: number) => ({
    id: s.id,
    version: `v${s.version}`,
    date: new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    label: s.label || `Snapshot ${s.version}`,
    status: i === 0 ? "current" : "snapshot",
  }));

  const allDomains = health.domains || [];
  const avgDomainCount = allDomains.length > 0 ? allDomains.reduce((s: number, d: { count: number }) => s + d.count, 0) / allDomains.length : 0;
  const gapAnalysis = allDomains
    .filter((d: { count: number }) => d.count < avgDomainCount * 0.5)
    .map((d: { name: string; count: number }) => ({
      domain: d.name,
      severity: d.count <= 1 ? "high" : d.count <= 3 ? "medium" : "low",
      suggestion: `Only ${d.count} memor${d.count === 1 ? "y" : "ies"} \u2014 consider adding more training data`,
    }));

  async function handleExport() {
    if (!activeBrainId) return;
    setExporting(true);
    try {
      const [memRes, graphRes] = await Promise.all([
        fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brainId: activeBrainId, limit: 100 }),
        }),
        fetch(`/api/graph?brainId=${activeBrainId}`),
      ]);
      const memData = await memRes.json();
      const graphData = await graphRes.json();

      const exportData = {
        brain: health.brain,
        memories: (memData.memories || []).map((m: Record<string, unknown>) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { embedding, ...rest } = m;
          return rest;
        }),
        concepts: graphData.concepts || [],
        relationships: graphData.relationships || [],
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${brainName}-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
    setExporting(false);
  }

  async function handleFreeze() {
    if (!activeBrainId) return;
    await updateBrain.mutateAsync({ id: activeBrainId, is_frozen: !isFrozen });
    refetch();
  }

  async function handleDeleteBrain() {
    if (!activeBrainId || brains.length <= 1) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await deleteBrain.mutateAsync(activeBrainId);
    router.push("/dashboard");
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div variants={fade} initial="hidden" animate="show" className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">Brain Health</h1>
          <p className="text-sm text-muted-foreground">{brainName} — version {brainVersion} — last updated {lastUpdatedLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {isFrozen && (
            <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 gap-1.5">
              <Archive className="w-3 h-3" /> Frozen
            </Badge>
          )}
          <Badge className={isHealthy ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20 gap-1.5" : "bg-amber-400/10 text-amber-400 border-amber-400/20 gap-1.5"}>
            {isHealthy ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            {isHealthy ? "Healthy" : "Needs Training"}
          </Badge>
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Zap className="w-3 h-3" /> Score: {overallScore}/100
          </Badge>
        </div>
      </motion.div>

      {/* Top metrics */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Database,    label: "Total Memories",  value: memoryCount.toLocaleString(),    color: "text-primary bg-primary/10" },
          { icon: GitBranch,   label: "Concepts",        value: conceptCount.toLocaleString(),   color: "text-sky-400 bg-sky-400/10" },
          { icon: TrendingUp,  label: "Avg Confidence",  value: `${avgConfidence}%`,             color: "text-emerald-400 bg-emerald-400/10" },
          { icon: AlertCircle, label: "Low Confidence",  value: `${lowPct}%`,                    color: "text-amber-400 bg-amber-400/10" },
        ].map(({ icon: Icon, label, value, color }) => (
          <motion.div key={label} variants={fade}>
            <Card className="bg-card border-border">
              <CardContent className="p-4 flex gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold">{value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Radar */}
        <motion.div variants={fade}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" /> Cognitive Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-4">
              {memoryCount === 0 ? (
                <div className="h-[220px] flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">No data yet. Train your brain first.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="#1e2333" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Radar dataKey="score" stroke="#7c5cfc" fill="#7c5cfc" fillOpacity={0.15} strokeWidth={1.5} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Training Overview */}
        <motion.div variants={fade}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Training Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <Zap className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-semibold">{health.trainingProgress?.completed || 0}/{health.trainingProgress?.total || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Jobs completed</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Confidence distribution</span>
                </div>
                <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-muted/30">
                  {totalConf > 0 && (
                    <>
                      <div className="bg-emerald-500 rounded-l" style={{ width: `${(conf.high / totalConf) * 100}%` }} />
                      <div className="bg-amber-500" style={{ width: `${(conf.medium / totalConf) * 100}%` }} />
                      <div className="bg-red-500 rounded-r" style={{ width: `${(conf.low / totalConf) * 100}%` }} />
                    </>
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />High ({conf.high})</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Medium ({conf.medium})</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Low ({conf.low})</span>
                </div>
              </div>
              <div className="space-y-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Top domains</span>
                {allDomains.slice(0, 4).map((d: { name: string; count: number }) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="text-foreground/80">{d.name}</span>
                    <span className="font-mono text-muted-foreground">{d.count}</span>
                  </div>
                ))}
                {allDomains.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No domains yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Gap Analysis */}
      <motion.div variants={fade} initial="hidden" animate="show">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Knowledge Gap Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {gapAnalysis.length > 0 ? (
              gapAnalysis.map((gap: { domain: string; severity: string; suggestion: string }) => (
                <div key={gap.domain} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${severityColor[gap.severity]}`}>
                    {gap.severity}
                  </Badge>
                  <span className="text-sm font-medium w-36 shrink-0">{gap.domain}</span>
                  <span className="text-xs text-muted-foreground flex-1">{gap.suggestion}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                {memoryCount === 0 ? "No data yet. Train your brain to see knowledge gaps." : "No significant knowledge gaps detected."}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Snapshots + Actions */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Snapshots */}
        <motion.div variants={fade}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Archive className="w-4 h-4 text-primary" /> Brain Snapshots
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {snapshots.length > 0 ? (
                snapshots.map((s: { id: string; version: string; date: string; label: string; status: string }) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium">{s.version}</span>
                        {s.status === "current" && <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20">current</Badge>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{s.date}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No snapshots yet.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Brain Actions */}
        <motion.div variants={fade}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Brain Actions</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {/* Export */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/20">
                <Download className="w-4 h-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Export Brain</p>
                  <p className="text-[11px] text-muted-foreground">Download full brain as JSON</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={handleExport} disabled={exporting}>
                  {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Export"}
                </Button>
              </div>
              {/* Freeze / Unfreeze */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/20">
                <Archive className="w-4 h-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{isFrozen ? "Unfreeze Brain" : "Freeze Brain"}</p>
                  <p className="text-[11px] text-muted-foreground">{isFrozen ? "Unfreeze to allow training and chat" : "Freeze brain to read-only state"}</p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={handleFreeze} disabled={updateBrain.isPending}>
                  {updateBrain.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : isFrozen ? "Unfreeze" : "Freeze"}
                </Button>
              </div>
              {/* Delete */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
                <Trash2 className="w-4 h-4 shrink-0 text-destructive" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-destructive">Delete Brain</p>
                  <p className="text-[11px] text-muted-foreground">Permanently delete all data</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={handleDeleteBrain}
                  disabled={brains.length <= 1 || deleteBrain.isPending}
                >
                  {deleteBrain.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : confirmDelete ? "Confirm?" : "Delete"}
                </Button>
              </div>
              {brains.length <= 1 && (
                <p className="text-[10px] text-muted-foreground text-center">Cannot delete your last brain</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
