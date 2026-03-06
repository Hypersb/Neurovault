"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, GitBranch, Activity, TrendingUp, Zap, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useBrainContext, useBrainHealth } from "@/lib/hooks";
import { PageError } from "@/components/ui/page-error";

const CONF_COLORS = ["#22c55e", "#f59e0b", "#ef4444"];

export default function DashboardPage() {
  const { activeBrainId, brains } = useBrainContext();
  const activeBrain = brains.find((b) => b.id === activeBrainId);
  const { data: health, isLoading, error, refetch } = useBrainHealth(activeBrainId);

  if (error) return <PageError message={error instanceof Error ? error.message : String(error)} onRetry={() => refetch()} />;

  if (isLoading || !health) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const confData = [
    { name: "High", value: health.confidenceDistribution?.high || 0 },
    { name: "Medium", value: health.confidenceDistribution?.medium || 0 },
    { name: "Low", value: health.confidenceDistribution?.low || 0 },
  ];

  const stats = [
    { label: "Memories", value: health.memoryCount, icon: Database, color: "text-purple-400" },
    { label: "Concepts", value: health.conceptCount, icon: GitBranch, color: "text-sky-400" },
    { label: "Relationships", value: health.relationshipCount, icon: Activity, color: "text-emerald-400" },
    { label: "Brain Version", value: `v${health.brain?.version || 1}`, icon: TrendingUp, color: "text-amber-400" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of <span className="text-primary">{activeBrain?.name || "your brain"}</span>
        </p>
      </motion.div>

      {/* Stats grid */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xl font-semibold">{value}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Confidence distribution */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium">Confidence Distribution</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="h-40">
                {confData.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={confData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                        {confData.map((_, i) => (
                          <Cell key={i} fill={CONF_COLORS[i]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">No confidence data yet</p>
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-4 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />High ({confData[0].value})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Medium ({confData[1].value})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Low ({confData[2].value})</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Top domains */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium">Top Domains</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {(health.domains || []).slice(0, 6).map((d: { name: string; count: number }) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <span className="text-foreground/80">{d.name}</span>
                  <span className="font-mono text-muted-foreground">{d.count}</span>
                </div>
              ))}
              {(!health.domains || health.domains.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-4">No data yet. Train your brain first.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Training progress */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium">Training Progress</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <Zap className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-semibold">{health.trainingProgress?.completed || 0}/{health.trainingProgress?.total || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Jobs completed</p>
                </div>
              </div>
              {(health.recentJobs || []).slice(0, 3).map((j: { id: string; file_name: string; status: string }) => (
                <div key={j.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground/80 max-w-[160px]">{j.file_name}</span>
                  <span className={j.status === "done" ? "text-emerald-400" : j.status === "error" ? "text-red-400" : "text-primary"}>{j.status}</span>
                </div>
              ))}
              {(!health.recentJobs || health.recentJobs.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-4">No training jobs yet.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
