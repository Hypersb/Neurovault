"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, MessageSquare, Zap, Database, GitBranch,
  Activity, Settings, Brain, ChevronDown, Plus, Sparkles, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrainContext, useUser, useLogout, useCreateBrain } from "@/lib/hooks";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/chat",      icon: MessageSquare,   label: "Chat",    badge: "Live" },
  { href: "/train",     icon: Zap,             label: "Train AI" },
  { href: "/memory",    icon: Database,        label: "Memory Explorer" },
  { href: "/graph",     icon: GitBranch,       label: "Knowledge Graph" },
  { href: "/health",    icon: Activity,        label: "Brain Health" },
  { href: "/settings",  icon: Settings,        label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [brainsOpen, setBrainsOpen] = useState(true);
  const { brains, activeBrainId, setActiveBrainId, isLoading } = useBrainContext();
  const { data: user } = useUser();
  const logout = useLogout();
  const createBrain = useCreateBrain();

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "??";

  return (
    <aside className="w-60 shrink-0 h-screen flex flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-5 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center pulse-glow">
          <Brain className="w-4 h-4 text-primary" />
        </div>
        <span className="font-semibold text-sm tracking-tight">NeuroVault</span>
        <span className="ml-auto text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">v1.0</span>
      </div>

      {/* Brain selector */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => setBrainsOpen(!brainsOpen)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/60 text-xs text-muted-foreground transition-colors"
        >
          <Sparkles className="w-3 h-3 text-primary/70" />
          <span className="font-medium text-foreground/70 uppercase tracking-widest text-[10px]">Brains</span>
          <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", brainsOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {brainsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="py-1 space-y-0.5">
                {isLoading ? (
                  <p className="text-[10px] text-muted-foreground px-2 py-1.5">Loading…</p>
                ) : (
                  brains.map((brain) => (
                    <div
                      key={brain.id}
                      onClick={() => setActiveBrainId(brain.id)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors",
                        brain.id === activeBrainId
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <div className={cn("w-1.5 h-1.5 rounded-full", brain.id === activeBrainId ? "bg-primary" : "bg-muted-foreground/40")} />
                      <span className="truncate">{brain.name}</span>
                      {brain.id === activeBrainId && <span className="ml-auto text-[9px] font-mono text-primary/70">active</span>}
                    </div>
                  ))
                )}
                <button
                  onClick={() => createBrain.mutate({ name: `Brain ${brains.length + 1}` })}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 w-full transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>New brain</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-3 my-1 border-t border-border" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label, badge }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 group relative",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-md bg-primary/10"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className={cn("w-4 h-4 shrink-0 relative z-10", active && "text-primary")} />
              <span className="relative z-10 truncate">{label}</span>
              {badge && (
                <span className="ml-auto relative z-10 text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 pt-2 border-t border-border mt-1">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-semibold text-primary shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.user_metadata?.full_name || user?.email || "User"}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email || ""}</p>
          </div>
          <button onClick={logout} className="text-muted-foreground hover:text-foreground transition-colors">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
