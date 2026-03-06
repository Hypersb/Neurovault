"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Brain, User, Sparkles, RefreshCw, Copy, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useBrainContext } from "@/lib/hooks";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const { activeBrainId, brains } = useBrainContext();
  const activeBrain = brains.find((b) => b.id === activeBrainId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || isStreaming || !activeBrainId) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brainId: activeBrainId, message: userMsg.content, conversationId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Chat failed" }));
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${err.error || "Something went wrong"}` } : m));
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setIsStreaming(false); return; }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + parsed.text } : m));
            }
            if (parsed.conversationId) setConversationId(parsed.conversationId);
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "Failed to connect. Please try again." } : m));
    }

    setIsStreaming(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function autoResize() {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="h-14 border-b border-border flex items-center px-5 gap-3 shrink-0">
        <Brain className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">{activeBrain?.name || "Select a brain"}</span>
        <Badge variant="outline" className="text-[10px] border-emerald-400/30 text-emerald-400 bg-emerald-400/5 gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
        </Badge>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { setMessages([]); setConversationId(null); }}>
            <RefreshCw className="w-3 h-3 mr-1" /> New chat
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center pulse-glow">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground text-center max-w-sm">Start a conversation with your AI brain. It will use its trained knowledge to respond.</p>
            </motion.div>
          )}

          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div className={cn("rounded-xl px-4 py-3 max-w-[80%] text-sm leading-relaxed", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border")}>
                  <p className="whitespace-pre-wrap">
                    {msg.content}
                    {msg.role === "assistant" && isStreaming && msg === messages[messages.length - 1] && <span className="cursor-blink" />}
                  </p>
                  {msg.role === "assistant" && msg.content && !isStreaming && (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                      <button onClick={() => navigator.clipboard.writeText(msg.content)} className="text-muted-foreground hover:text-foreground transition-colors p-1"><Copy className="w-3 h-3" /></button>
                      <button className="text-muted-foreground hover:text-foreground transition-colors p-1"><ThumbsUp className="w-3 h-3" /></button>
                      <button className="text-muted-foreground hover:text-foreground transition-colors p-1"><ThumbsDown className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-card border border-border rounded-xl px-4 py-3 focus-within:border-primary/40 transition-colors">
            <Textarea ref={textareaRef} value={input} onChange={(e) => { setInput(e.target.value); autoResize(); }} onKeyDown={handleKey} placeholder="Ask your brain anything…" rows={1} className="flex-1 resize-none bg-transparent border-0 p-0 text-sm focus-visible:ring-0 min-h-[24px] max-h-40" />
            <Button size="icon" onClick={handleSend} disabled={!input.trim() || isStreaming || !activeBrainId} className={cn("h-8 w-8 rounded-lg shrink-0", input.trim() ? "bg-primary hover:bg-primary/90" : "bg-muted")}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">Powered by GPT-4o mini with memory-augmented retrieval</p>
        </div>
      </div>
    </div>
  );
}
