"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Lock, FileText, Mic, Globe, TrendingUp, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrainContext, useMemories } from "@/lib/hooks";
import { PageError } from "@/components/ui/page-error";

function MessageIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
}

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  pdf:   <FileText className="w-3 h-3 text-red-400" />,
  audio: <Mic className="w-3 h-3 text-amber-400" />,
  web:   <Globe className="w-3 h-3 text-sky-400" />,
  text:  <FileText className="w-3 h-3 text-blue-400" />,
  chat:  <MessageIcon className="w-3 h-3 text-purple-400" />,
};

function confidenceColor(c: number) {
  if (c >= 0.85) return "text-emerald-400";
  if (c >= 0.65) return "text-amber-400";
  return "text-red-400";
}

export default function MemoryPage() {
  const { activeBrainId } = useBrainContext();
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("all");
  const [sort, setSort] = useState("confidence");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useMemories(activeBrainId, search || undefined, domain !== "all" ? domain : undefined, sort);
  const memories = data?.memories || [];
  const domains = data?.domains || [];
  const total = data?.total || 0;

  const selectedMemory = memories.find((m) => m.id === selected);

  if (error) return <PageError message={error instanceof Error ? error.message : String(error)} onRetry={() => refetch()} />;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Memory Explorer</h1>
        <p className="text-sm text-muted-foreground">Browse, search, and inspect all stored memories. <span className="text-primary">{total} total</span></p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search memories…" className="pl-8 h-8 text-sm bg-card" />
        </div>
        <Select value={domain} onValueChange={setDomain}>
          <SelectTrigger className="w-44 h-8 text-sm bg-card"><SelectValue placeholder="Domain" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {domains.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40 h-8 text-sm bg-card"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="confidence">By Confidence</SelectItem>
            <SelectItem value="usage">By Usage</SelectItem>
            <SelectItem value="recent">Most Recent</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      <div className="flex gap-4">
        <div className="flex-1 space-y-2">
          {isLoading && (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
          )}
          {!isLoading && memories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No memories found. Train your brain to create memories.</p>
          )}
          {memories.map((mem, i) => {
            const color = confidenceColor(mem.confidence_score);
            const isSelected = selected === mem.id;
            return (
              <motion.div key={mem.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card
                  onClick={() => setSelected(isSelected ? null : mem.id)}
                  className={cn("bg-card border-border cursor-pointer transition-all hover:border-primary/30", isSelected && "border-primary/50 bg-primary/5")}
                >
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <Lock className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2 flex-1">{mem.content}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">{SOURCE_ICONS[mem.source_type] || SOURCE_ICONS.text} {mem.source_type}</span>
                      <span className={cn("text-[10px] font-mono font-semibold", color)}>{(mem.confidence_score * 100).toFixed(0)}% conf.</span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><TrendingUp className="w-3 h-3" />{mem.usage_count} uses</span>
                      {mem.domain && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{mem.domain}</span>}
                    </div>
                    <Progress value={mem.confidence_score * 100} className="h-1" />
                    {mem.tags && mem.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {mem.tags.map((t) => <Badge key={t} variant="outline" className="text-[9px] px-1.5 py-0 border-border text-muted-foreground">{t}</Badge>)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {selectedMemory && (
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="w-72 shrink-0">
            <Card className="bg-card border-primary/20 sticky top-0">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Memory Detail</span>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed">{selectedMemory.content}</p>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Confidence</span><span className={cn("font-mono font-semibold", confidenceColor(selectedMemory.confidence_score))}>{(selectedMemory.confidence_score * 100).toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span>Usage count</span><span className="font-mono">{selectedMemory.usage_count}</span></div>
                  <div className="flex justify-between"><span>Source</span><span className="capitalize">{selectedMemory.source_type}</span></div>
                  <div className="flex justify-between"><span>Domain</span><span>{selectedMemory.domain || "General"}</span></div>
                  <div className="flex justify-between items-center"><span>Encrypted</span><Lock className="w-3 h-3 text-emerald-400" /></div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
