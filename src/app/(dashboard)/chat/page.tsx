"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Brain, User, Sparkles, RefreshCw, Copy, Check, ThumbsUp, ThumbsDown, FileText, Database, History, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useBrainContext, useConversations } from "@/lib/hooks";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

interface SourceCitation {
  id: string;
  content: string;
  source_type: string;
  confidence: number;
  domain: string | null;
  similarity: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
}

const suggestedPrompts = [
  "What do you know about...",
  "Summarize my notes on...",
  "How does X relate to Y?",
];

export default function ChatPage() {
  const { activeBrainId, brains } = useBrainContext();
  const activeBrain = brains.find((b) => b.id === activeBrainId);
  const { data: conversations, refetch: refetchConversations } = useConversations(activeBrainId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Clear chat when switching brains
  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setInput("");
    setFeedback({});
  }, [activeBrainId]);

  function handleCopy(msgId: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopiedId(msgId);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  }

  function loadConversation(convId: string, convMessages: { role: "user" | "assistant"; content: string }[]) {
    setConversationId(convId);
    setMessages(convMessages.map((m, i) => ({ id: `hist-${i}`, role: m.role, content: m.content })));
    setFeedback({});
  }

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
            if (parsed.sources) {
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, sources: parsed.sources } : m));
            }
            if (parsed.conversationId) setConversationId(parsed.conversationId);
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: "Failed to connect. Please try again." } : m));
    }

    setIsStreaming(false);
    refetchConversations();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function autoResize() {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
  }

  function toggleFeedback(msgId: string, type: "up" | "down") {
    setFeedback((prev) => ({
      ...prev,
      [msgId]: prev[msgId] === type ? undefined as unknown as "up" : type,
    }));
  }

  const isLastAssistantMsg = (msg: Message) => msg.role === "assistant" && msg === messages[messages.length - 1];

  return (
    <div className="flex flex-col h-screen">
      <div className="h-14 border-b border-border flex items-center px-5 gap-3 shrink-0">
        <Brain className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">{activeBrain?.name || "Select a brain"}</span>
        <Badge variant="outline" className="text-[10px] border-emerald-400/30 text-emerald-400 bg-emerald-400/5 gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          {conversations && conversations.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                  <History className="w-3 h-3 mr-1" /> History <ChevronDown className="w-3 h-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-60 overflow-y-auto">
                {conversations.map((conv) => (
                  <DropdownMenuItem
                    key={conv.id}
                    onClick={() => loadConversation(conv.id, conv.messages)}
                    className={cn("flex flex-col items-start gap-0.5 cursor-pointer", conv.id === conversationId && "bg-primary/10")}
                  >
                    <span className="text-xs truncate w-full">{conv.title}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(conv.updated_at).toLocaleDateString()}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { setMessages([]); setConversationId(null); setFeedback({}); }}>
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
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
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
                <div className={cn("rounded-xl px-4 py-3 max-w-[80%] text-sm leading-relaxed overflow-hidden", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border")}>
                  {/* Typing indicator */}
                  {msg.role === "assistant" && isStreaming && isLastAssistantMsg(msg) && msg.content === "" && (
                    <div className="flex items-center gap-1.5 py-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary"
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Message content */}
                  {msg.content && (
                    msg.role === "user" ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="markdown-content">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            h1: ({ children }) => <h1 className="text-base font-semibold mb-1 mt-3 first:mt-0">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-sm font-semibold mb-1 mt-2.5 first:mt-0">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-sm font-medium mb-0.5 mt-2 first:mt-0">{children}</h3>,
                            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                            li: ({ children }) => <li className="text-sm">{children}</li>,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            code: ({ className: _cn, children, ...props }) => {
                              const isBlock = String(children).includes("\n");
                              return isBlock
                                ? <pre className="bg-muted/60 border border-border rounded-lg p-3 overflow-x-auto my-2 text-[12px] font-mono"><code {...props}>{children}</code></pre>
                                : <code className="bg-muted px-1.5 py-0.5 rounded text-[12px] font-mono" {...props}>{children}</code>;
                            },
                            blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground">{children}</blockquote>,
                            table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
                            th: ({ children }) => <th className="border border-border px-2 py-1 bg-muted/40 font-medium text-left">{children}</th>,
                            td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
                            a: ({ href, children }) => <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                        {isStreaming && isLastAssistantMsg(msg) && <span className="cursor-blink" />}
                      </div>
                    )
                  )}

                  {/* Source citations */}
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && !isStreaming && (
                    <div className="mt-2 pt-2 border-t border-border/50 space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium">Sources ({msg.sources.length} memories used)</p>
                      {msg.sources.slice(0, 3).map((src) => (
                        <div key={src.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1 shrink-0">
                            {src.source_type === "pdf" ? <FileText className="w-2.5 h-2.5" /> : <Database className="w-2.5 h-2.5" />}
                            {src.source_type}
                          </span>
                          <span className="truncate max-w-[200px]">{src.content}</span>
                          <span className="ml-auto font-mono text-primary/70 shrink-0">{(src.similarity * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  {msg.role === "assistant" && msg.content && !isStreaming && (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                      <button onClick={() => handleCopy(msg.id, msg.content)} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Copy">
                        {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => toggleFeedback(msg.id, "up")}
                        className={cn("transition-colors p-1", feedback[msg.id] === "up" ? "text-emerald-400" : "text-muted-foreground hover:text-foreground")}
                        title="Good response"
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => toggleFeedback(msg.id, "down")}
                        className={cn("transition-colors p-1", feedback[msg.id] === "down" ? "text-red-400" : "text-muted-foreground hover:text-foreground")}
                        title="Bad response"
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
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
          <p className="text-[10px] text-muted-foreground text-center mt-2">Powered by Gemini with memory-augmented retrieval</p>
        </div>
      </div>
    </div>
  );
}
