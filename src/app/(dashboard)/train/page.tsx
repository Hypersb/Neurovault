"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Mic, File, CheckCircle2, Loader2, Sparkles, ChevronRight, AlertCircle, MessageSquare, Send, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrainContext, useTrainingJobs, useUploadTraining, useChatTrain, type TrainingJob } from "@/lib/hooks";

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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function TrainPage() {
  const { activeBrainId } = useBrainContext();
  const { data: jobs = [] } = useTrainingJobs(activeBrainId);
  const uploadMutation = useUploadTraining();
  const chatTrain = useChatTrain();
  const [dragging, setDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"upload" | "chat">("upload");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

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
      setUploadingFiles((prev) => [...prev, file.name]);
      uploadMutation.mutate(
        { file, brainId: activeBrainId },
        {
          onSettled: () => {
            setUploadingFiles((prev) => prev.filter((n) => n !== file.name));
          },
        }
      );
    });
  }

  async function handleChatSend() {
    if (!chatInput.trim() || !activeBrainId || chatTrain.isPending) return;
    const text = chatInput.trim();
    setChatInput("");

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text };
    setChatMessages((prev) => [...prev, userMsg]);

    // Build history for context (previous messages in format the API expects)
    const apiHistory = chatMessages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

    chatTrain.mutate(
      { brainId: activeBrainId, message: text, history: apiHistory },
      {
        onSuccess: (data) => {
          // Show the AI's conversational reply
          const badge = data.stored
            ? data.conceptsCreated > 0
              ? ` [Stored + ${data.conceptsCreated} concept${data.conceptsCreated > 1 ? "s" : ""} extracted]`
              : " [Stored as memory]"
            : "";
          setChatMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: data.reply + badge }]);
          setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
        },
        onError: (err) => {
          setChatMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: `Sorry, something went wrong: ${err instanceof Error ? err.message : "Unknown error"}` }]);
        },
      }
    );
    setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
  }

  function handleChatKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
  }

  const isUploading = uploadingFiles.length > 0 || uploadMutation.isPending;

  const completedCount = jobs.filter((j: TrainingJob) => j.status === "done").length;
  const totalMemories = jobs.reduce((sum: number, j: TrainingJob) => sum + (j.memories_created || 0), 0);
  const totalConcepts = jobs.reduce((sum: number, j: TrainingJob) => sum + (j.concepts_created || 0), 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Train Your AI</h1>
        <p className="text-sm text-muted-foreground">Upload documents or chat to build your brain&apos;s knowledge base.</p>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="flex flex-wrap gap-3">
        {[
          { label: "Files processed", value: completedCount, icon: FileText },
          { label: "Memories created", value: totalMemories, icon: Sparkles },
          { label: "Concepts extracted", value: totalConcepts, icon: ChevronRight },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card border-border flex-1 min-w-[140px]">
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

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("upload")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "upload" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Upload className="w-3.5 h-3.5" /> File Upload
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            activeTab === "chat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" /> Chat Training
        </button>
      </div>

      {/* File Upload Tab */}
      {activeTab === "upload" && (
        <>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); if (!isUploading) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={isUploading ? undefined : handleDrop}
              onClick={isUploading ? undefined : () => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl py-12 px-6 flex flex-col items-center gap-4 transition-all",
                isUploading
                  ? "border-primary/40 bg-primary/5 cursor-wait"
                  : dragging ? "border-primary bg-primary/5 cursor-pointer" : "border-border hover:border-primary/40 hover:bg-muted/20 cursor-pointer"
              )}
            >
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.mp3,.wav,.m4a" onChange={handleFileSelect} className="hidden" />
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-colors", isUploading || dragging ? "bg-primary/20" : "bg-muted/60")}>
                {isUploading ? (
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                ) : (
                  <Upload className={cn("w-5 h-5 transition-colors", dragging ? "text-primary" : "text-muted-foreground")} />
                )}
              </div>
              <div className="text-center">
                {isUploading ? (
                  <>
                    <p className="text-sm font-medium text-primary">Processing {uploadingFiles[0] || "file"}…</p>
                    <p className="text-xs text-muted-foreground mt-1">Parsing, embedding, and extracting entities. This may take a minute.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">{dragging ? "Drop files here" : "Drag & drop files or click to browse"}</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MP3, WAV — up to 50 MB</p>
                  </>
                )}
              </div>
            </div>
          </motion.div>

          {uploadMutation.isError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="bg-card border-red-400/20">
                <CardContent className="p-3 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">
                    Upload failed: {uploadMutation.error instanceof Error ? uploadMutation.error.message : "Something went wrong"}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}

      {/* Chat Training Tab */}
      {activeTab === "chat" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              {/* Chat area */}
              <div ref={chatRef} className="h-[320px] overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Chat to Train</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        Chat naturally with your AI — it responds like ChatGPT while automatically storing everything you say as memories in your brain.
                      </p>
                    </div>
                  </div>
                )}
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Brain className="w-3 h-3 text-primary" />
                      </div>
                    )}
                    <div className={cn(
                      "rounded-lg px-3 py-2 max-w-[80%] text-xs leading-relaxed",
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"
                    )}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {chatTrain.isPending && (
                  <div className="flex gap-2 justify-start">
                    <div className="rounded-lg px-3 py-2 bg-muted/60 text-foreground">
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKey}
                    placeholder="Type knowledge to teach your brain…"
                    rows={2}
                    className="flex-1 resize-none bg-muted/30 border-border text-sm min-h-[44px] max-h-24"
                  />
                  <Button
                    size="icon"
                    onClick={handleChatSend}
                    disabled={!chatInput.trim() || chatTrain.isPending || !activeBrainId}
                    className="h-9 w-9 rounded-lg shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Each message is embedded, stored as memory, and concepts are extracted for the knowledge graph.</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
                          {isError && job.error_message && (
                            <p className="text-[10px] text-red-400/80 mt-0.5 truncate">{job.error_message}</p>
                          )}
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
