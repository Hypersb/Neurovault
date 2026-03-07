"use client";

import { motion, type Variants } from "framer-motion";
import { Brain, GitBranch, MessageSquare, Zap, ArrowRight, Sparkles, Shield, BarChart3 } from "lucide-react";
import Link from "next/link";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

const features = [
  { icon: Brain, title: "Cognitive Architecture", desc: "Multi-brain workspace with personality profiles, memory decay, and version control for your knowledge.", color: "text-purple-400" },
  { icon: GitBranch, title: "Knowledge Graph", desc: "Automatic concept extraction and relationship mapping from documents, visualized as an interactive graph.", color: "text-sky-400" },
  { icon: MessageSquare, title: "AI Chat with Memory", desc: "RAG-powered conversations grounded in your trained knowledge with source citations.", color: "text-emerald-400" },
  { icon: Zap, title: "Training Pipeline", desc: "Upload PDFs, DOCX, audio, or text. Automatically parsed, chunked, embedded, and entity-extracted.", color: "text-amber-400" },
];

const stats = [
  { label: "Embedding Dimensions", value: "3,072" },
  { label: "Supported Formats", value: "PDF, DOCX, TXT, MP3" },
  { label: "AI Models", value: "Gemini 2.5" },
  { label: "Vector Search", value: "pgvector" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center pulse-glow">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-sm tracking-tight">NeuroVault</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">
              Login
            </Link>
            <Link href="/register" className="text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 rounded-lg transition-colors font-medium">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-24 pb-20 px-6">
        {/* Animated gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <motion.div
            className="w-[600px] h-[600px] rounded-full bg-primary/15 blur-[140px]"
            animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        {/* Floating neural dots */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-primary/60"
            animate={{
              x: [0, (i % 2 ? 40 : -30), (i % 3 ? -20 : 25), 0],
              y: [0, (i % 2 ? -30 : 20), (i % 3 ? 35 : -15), 0],
              opacity: [0.2, 0.7, 0.3, 0.2],
            }}
            transition={{ duration: 5 + i * 0.8, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
            style={{ top: `${20 + i * 8}%`, left: `${30 + (i % 4) * 12}%` }}
          />
        ))}

        {/* Connecting lines between dots */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.08 }}>
          <motion.line x1="35%" y1="25%" x2="55%" y2="40%" stroke="hsl(262 80% 65%)" strokeWidth="1" animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 4, repeat: Infinity }} />
          <motion.line x1="55%" y1="40%" x2="42%" y2="60%" stroke="hsl(262 80% 65%)" strokeWidth="1" animate={{ opacity: [0.5, 0.2, 0.5] }} transition={{ duration: 5, repeat: Infinity }} />
          <motion.line x1="42%" y1="60%" x2="65%" y2="55%" stroke="hsl(262 80% 65%)" strokeWidth="1" animate={{ opacity: [0.2, 0.6, 0.2] }} transition={{ duration: 3.5, repeat: Infinity }} />
        </svg>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full mb-6">
              <Sparkles className="w-3 h-3" /> AI-Powered Cognitive Infrastructure
            </span>
          </motion.div>

          <motion.h1 initial="hidden" animate="visible" variants={fadeUp} custom={1} className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Your Personal AI Brain,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-sky-400">
              Supercharged
            </span>
          </motion.h1>

          <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2} className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Train your AI brain with documents, explore knowledge as interactive graphs,
            and chat with memory-augmented retrieval. Built on semantic embeddings and cognitive architecture.
          </motion.p>

          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="flex items-center justify-center gap-4">
            <Link href="/register" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-xl transition-all font-medium text-sm hover:shadow-lg hover:shadow-primary/25">
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground px-6 py-3 rounded-xl transition-all text-sm">
              See Features
            </a>
          </motion.div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border/50 bg-card/30">
        <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i} className="text-center">
              <p className="text-lg font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Everything You Need to Build Intelligent Memory</h2>
            <p className="text-muted-foreground text-sm max-w-xl mx-auto">A complete cognitive infrastructure platform for training, storing, and querying your personal AI brain.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i + 1}
                whileHover={{ y: -3 }}
                className="group bg-card/50 backdrop-blur border border-border rounded-xl p-6 hover:border-primary/30 transition-colors"
              >
                <div className={`w-10 h-10 rounded-lg bg-card flex items-center justify-center border border-border mb-4 ${f.color}`}>
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Highlights */}
      <section className="py-16 px-6 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: Shield, title: "Secure by Default", desc: "Row-level security, encrypted embeddings, and Supabase auth protect every memory." },
              { icon: BarChart3, title: "Brain Health Analytics", desc: "Monitor confidence distribution, domain coverage, and gap analysis in real-time." },
              { icon: Sparkles, title: "Powered by Gemini", desc: "Google Gemini 2.5 Flash for generation, embeddings, entity extraction, and audio transcription." },
            ].map((item, i) => (
              <motion.div key={item.title} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i} className="text-center p-5">
                <item.icon className="w-5 h-5 text-primary mx-auto mb-3" />
                <h4 className="font-medium text-sm mb-1.5">{item.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 pulse-glow">
            <Brain className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Start Building Your AI Brain</h2>
          <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">Upload your documents, train your brain, and unlock intelligent conversations grounded in your own knowledge.</p>
          <Link href="/register" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl transition-all font-medium text-sm hover:shadow-lg hover:shadow-primary/25">
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-primary" />
            <span>NeuroVault</span>
          </div>
          <span>Built with Next.js, Supabase, and Gemini</span>
        </div>
      </footer>
    </div>
  );
}
