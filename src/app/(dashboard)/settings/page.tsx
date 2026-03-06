"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { User, Brain, Shield, Zap, Key, Save, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrainContext, useUser, useUpdateBrain, useUpdateProfile, useChangePassword } from "@/lib/hooks";

const sections = [
  { id: "profile",  label: "Profile",        icon: User   },
  { id: "brain",    label: "Brain Settings",  icon: Brain  },
  { id: "memory",   label: "Memory & AI",     icon: Zap    },
  { id: "security", label: "Security",        icon: Shield },
  { id: "api",      label: "API Access",      icon: Key    },
];

export default function SettingsPage() {
  const { activeBrainId, brains } = useBrainContext();
  const { data: user, isLoading: userLoading } = useUser();
  const activeBrain = brains.find((b) => b.id === activeBrainId);

  const updateBrain = useUpdateBrain();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [active, setActive] = useState("profile");

  // Profile state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Brain settings state
  const [brainName, setBrainName] = useState("");
  const [model, setModel] = useState("gemini-flash");
  const [autoReflection, setAutoReflection] = useState(true);
  const [kgUpdates, setKgUpdates] = useState(true);
  const [personalityInjection, setPersonalityInjection] = useState(true);
  const [memoryDecay, setMemoryDecay] = useState(false);

  // Memory & AI state
  const [topK, setTopK] = useState([8]);
  const [threshold, setThreshold] = useState([65]);
  const [formality, setFormality] = useState([72]);
  const [sourcePriority, setSourcePriority] = useState("all");

  // Security
  const [password, setPassword] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Initialize profile from user data
  useEffect(() => {
    if (user) {
      const meta = user.user_metadata || {};
      const parts = ((meta.full_name as string) || "").split(" ");
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
    }
  }, [user]);

  // Initialize brain settings from personality_profile
  useEffect(() => {
    if (activeBrain) {
      setBrainName(activeBrain.name);
      const pp = (activeBrain.personality_profile || {}) as Record<string, unknown>;
      setModel((pp.model as string) || "gemini-flash");
      setAutoReflection(pp.autoReflection !== false);
      setKgUpdates(pp.kgUpdates !== false);
      setPersonalityInjection(pp.personalityInjection !== false);
      setMemoryDecay(pp.memoryDecay === true);
      setTopK([(pp.topK as number) || 8]);
      setThreshold([Math.round(((pp.confidenceThreshold as number) || 0.65) * 100)]);
      setFormality([(pp.formality as number) || 72]);
      setSourcePriority((pp.sourcePriority as string) || "all");
    }
  }, [activeBrain]);

  const email = user?.email || "";
  const initials = ((firstName[0] || "") + (lastName[0] || "")).toUpperCase();

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const promises: Promise<unknown>[] = [];

      promises.push(updateProfile.mutateAsync({ firstName, lastName }));

      if (activeBrainId) {
        promises.push(
          updateBrain.mutateAsync({
            id: activeBrainId,
            name: brainName,
            personality_profile: {
              model,
              autoReflection,
              kgUpdates,
              personalityInjection,
              memoryDecay,
              topK: topK[0],
              confidenceThreshold: threshold[0] / 100,
              formality: formality[0],
              sourcePriority,
            },
          })
        );
      }

      if (password.trim()) {
        promises.push(changePassword.mutateAsync(password));
      }

      await Promise.all(promises);
      setPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
    setSaving(false);
  }

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, brain behaviour, and security preferences.</p>
      </motion.div>

      <div className="flex flex-col md:flex-row gap-5">
        <motion.nav initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="md:w-44 shrink-0 flex md:flex-col gap-0.5 overflow-x-auto">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap",
                active === id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </motion.nav>

        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 space-y-4"
        >
          {active === "profile" && (
            <>
              <Card className="bg-card border-border">
                <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium">Profile</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-xl font-semibold text-primary">
                      {initials || "?"}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">First name</Label>
                      <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 text-sm bg-muted/40" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Last name</Label>
                      <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 text-sm bg-muted/40" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Email</Label>
                      <Input value={email} readOnly className="h-8 text-sm bg-muted/40 opacity-60" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">Active Brain</p>
                    <p className="text-[11px] text-muted-foreground">{activeBrain?.name || "No brain selected"} · {brains.length} brain{brains.length !== 1 ? "s" : ""}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">v{activeBrain?.version || 1}</Badge>
                </CardContent>
              </Card>
            </>
          )}

          {active === "brain" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium">Brain Settings</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-xs">Brain name</Label>
                  <Input value={brainName} onChange={(e) => setBrainName(e.target.value)} className="h-8 text-sm bg-muted/40 max-w-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Base model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="h-8 text-sm bg-muted/40 max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-flash">Gemini 1.5 Flash</SelectItem>
                      <SelectItem value="gemini-pro">Gemini 1.5 Pro</SelectItem>
                      <SelectItem value="gemini-2-flash">Gemini 2.0 Flash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator className="border-border" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Auto-reflection after chat</p>
                    <p className="text-[11px] text-muted-foreground">Summarize learnings post-conversation</p>
                  </div>
                  <Switch checked={autoReflection} onCheckedChange={setAutoReflection} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Knowledge graph updates</p>
                    <p className="text-[11px] text-muted-foreground">Extract entities during training</p>
                  </div>
                  <Switch checked={kgUpdates} onCheckedChange={setKgUpdates} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Personality injection</p>
                    <p className="text-[11px] text-muted-foreground">Inject style profile into system prompt</p>
                  </div>
                  <Switch checked={personalityInjection} onCheckedChange={setPersonalityInjection} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Memory decay</p>
                    <p className="text-[11px] text-muted-foreground">Reduce confidence of unused memories</p>
                  </div>
                  <Switch checked={memoryDecay} onCheckedChange={setMemoryDecay} />
                </div>
              </CardContent>
            </Card>
          )}

          {active === "memory" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium">Memory & AI</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <Label>Top-K memory retrieval</Label>
                    <span className="font-mono text-primary">{topK[0]}</span>
                  </div>
                  <Slider value={topK} onValueChange={setTopK} min={1} max={20} step={1} className="w-full" />
                  <p className="text-[10px] text-muted-foreground">Number of memories injected into each prompt</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <Label>Confidence threshold</Label>
                    <span className="font-mono text-primary">{threshold[0]}%</span>
                  </div>
                  <Slider value={threshold} onValueChange={setThreshold} min={0} max={100} step={5} className="w-full" />
                  <p className="text-[10px] text-muted-foreground">Only retrieve memories above this confidence score</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <Label>Personality formality</Label>
                    <span className="font-mono text-primary">{formality[0]}%</span>
                  </div>
                  <Slider value={formality} onValueChange={setFormality} min={0} max={100} step={1} className="w-full" />
                  <p className="text-[10px] text-muted-foreground">Override the trained formality score</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Memory source priority</Label>
                  <Select value={sourcePriority} onValueChange={setSourcePriority}>
                    <SelectTrigger className="h-8 text-sm bg-muted/40 max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources equal</SelectItem>
                      <SelectItem value="pdf">Prefer PDF</SelectItem>
                      <SelectItem value="chat">Prefer chat history</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {active === "security" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium">Security</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {[
                  { label: "Database encryption", sub: "Supabase encrypts data at rest using AES-256", checked: true, locked: true },
                  { label: "Row-level security", sub: "Supabase RLS ensures you only see your data", checked: true, locked: true },
                ].map(({ label, sub, checked, locked }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm flex items-center gap-2">
                        {label}
                        {locked && <Badge variant="outline" className="text-[9px] border-emerald-400/30 text-emerald-400">enforced</Badge>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{sub}</p>
                    </div>
                    <Switch checked={checked} disabled={locked} />
                  </div>
                ))}
                <Separator className="border-border" />
                <div className="space-y-1.5">
                  <Label className="text-xs">Change password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password (min 6 characters)"
                    className="h-8 text-sm bg-muted/40 max-w-xs"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {active === "api" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium">API Access</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Active Brain ID</Label>
                  <div className="flex gap-2 max-w-md">
                    <Input value={activeBrainId || "No brain selected"} readOnly className="h-8 text-sm bg-muted/40 font-mono" />
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>User ID: <span className="text-foreground font-mono">{user?.id || "\u2014"}</span></p>
                  <p>Provider: <span className="text-foreground font-mono">Supabase Auth (email)</span></p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                  <p className="text-foreground/60">{"// Example: query your brain via API"}</p>
                  <p><span className="text-sky-400">POST</span> /api/chat</p>
                  <p>Content-Type: application/json</p>
                  <p>{"{"} &quot;brainId&quot;: &quot;{activeBrainId || "..."}&quot;, &quot;message&quot;: &quot;What is backprop?&quot; {"}"}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save button + status */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving\u2026" : saved ? "Saved!" : "Save changes"}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
