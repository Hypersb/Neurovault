"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Mic, File, CheckCircle2, Loader2, Sparkles, ChevronRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrainContext, useTrainingJobs, useUploadTraining, type TrainingJob } from "@/lib/hooks";

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued", parsing: "Parsing…", embedding: "Embedding…",
  extracting: "Extracting…", graph: "Graph update…", done: "Completed", error: "Failed",
};

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText, "application/pdf": FileText,
  audio: Mic, "audio/mpeg": Mic, "audio/wav": Mic,
  txt: File, text: File,
};

function StageTimeline({ status }: { status: string }) {
  const stages = ["parsing", "embedding", "extracting", "graph", "done"];
  const currentIdx = stages.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full transition-colors",
            i < currentIdx ? "bg-primary" : i === currentIdx ? "bg-primary animate-pulse" : "bg-muted-foreground/30"
          )} />
          {i < stages.length - 1 && <div className={cn("w-3 h-px", i < currentIdx ? "bg-primary" : "bg-muted-foreground/20")} />}
        </div>
      ))}
    </div>
  );
}

export default function TrainPage() {
  const { activeBrainId } = useBrainContext();
  const { data: jobs = [] } = useTrainingJobs(activeBrainId);
  const uploadMutation = useUploadTraining();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      uploadFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  }

  function uploadFiles(files: File[]) {
    if (!activeBrainId) return;
    files.forEach((file) => {
      uploadMutation.mutate({ file, brainId: activeBrainId });
    });
  }

  const completedCount = jobs.filter((j: TrainingJob) => j.status === "done").length;
  const totalMemories = jobs.reduce((sum: number, j: TrainingJob) => sum + (j.memories_created || 0), 0);
  const totalConcepts = jobs.reduce((sum: number, j: TrainingJob) => sum + (j.concepts_created || 0), 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Train Your AI</h1>
        <p className="text-sm text-muted-foreground">Upload documents to build your brain&apos;s knowledge base.</p>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="flex gap-3">
        {[
          { label: "Files processed", value: completedCount, icon: FileText },
          { label: "Memories created", value: totalMemories, icon: Sparkles },
          { label: "Concepts extracted", value: totalConcepts, icon: ChevronRight },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card border-border flex-1">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Drop zone */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl py-12 px-6 flex flex-col items-center gap-4 transition-all cursor-pointer",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20"
          )}
        >
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.mp3,.wav,.m4a" onChange={handleFileSelect} className="hidden" />
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-colors", dragging ? "bg-primary/20" : "bg-muted/60")}>
            <Upload className={cn("w-5 h-5 transition-colors", dragging ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">{dragging ? "Drop files here" : "Drag & drop files or click to browse"}</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MP3, WAV — up to 50 MB</p>
          </div>
        </div>
      </motion.div>

      {/* Job list */}
      {jobs.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Training Jobs</h2>
          <AnimatePresence>
            {jobs.map((job: TrainingJob, i: number) => {
              const Icon = FILE_ICONS[job.file_type] || File;
              const isDone = job.status === "done";
              const isError = job.status === "error";
              const isActive = !isDone && !isError && job.status !== "pending";

              return (
                <motion.div key={job.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card className={cn("bg-card border-border", isDone && "border-emerald-400/20", isError && "border-red-400/20")}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", isDone ? "bg-emerald-400/10" : isError ? "bg-red-400/10" : "bg-muted/60")}>
                          <Icon className={cn("w-4 h-4", isDone ? "text-emerald-400" : isError ? "text-red-400" : "text-muted-foreground")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{job.file_name}</p>
                            <span className="text-[10px] text-muted-foreground">{job.file_size}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn("text-[10px]", isDone ? "text-emerald-400" : isError ? "text-red-400" : "text-primary")}>{job.stage || STATUS_LABELS[job.status] || job.status}</span>
                            {isActive && <StageTimeline status={job.status} />}
                            {isDone && job.memories_created > 0 && (
                              <span className="text-[10px] text-muted-foreground">{job.memories_created} memories · {job.concepts_created} concepts</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          {isActive && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                          {isError && <AlertCircle className="w-4 h-4 text-red-400" />}
                        </div>
                      </div>
                      {isActive && <Progress value={job.progress} className="h-1 mt-2" />}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
