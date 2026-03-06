"use client";

import { useState } from "react";
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
import { User, Brain, Shield, Zap, Bell, Key, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrainContext, useUser } from "@/lib/hooks";

const sections = [
  { id: "profile",      label: "Profile",         icon: User    },
  { id: "brain",        label: "Brain Settings",  icon: Brain   },
  { id: "memory",       label: "Memory & AI",     icon: Zap     },
  { id: "security",     label: "Security",        icon: Shield  },
  { id: "notifications",label: "Notifications",   icon: Bell    },
  { id: "api",          label: "API Access",      icon: Key     },
];

export default function SettingsPage() {
  const { activeBrainId, brains } = useBrainContext();
  const { data: user, isLoading: userLoading } = useUser();
  const activeBrain = brains.find((b) => b.id === activeBrainId);

  const [active, setActive] = useState("profile");
  const [topK, setTopK] = useState([8]);
  const [threshold, setThreshold] = useState([65]);
  const [formality, setFormality] = useState([72]);
  const [saved, setSaved] = useState(false);

  const userMeta = user?.user_metadata || {};
  const fullName = userMeta.full_name || "";
  const nameParts = fullName.split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
  const initials = (firstName[0] || "") + (lastName[0] || "");
  const email = user?.email || "";

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-0.5">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, brain behaviour, and security preferences.</p>
      </motion.div>

      <div className="flex gap-5">
        {/* Sidebar nav */}
        <motion.nav initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="w-44 shrink-0 space-y-0.5">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
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

        {/* Content */}
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
                      {initials.toUpperCase() || "?"}
                    </div>
                    <div>
                      <Button variant="outline" size="sm" className="text-xs h-7">Change avatar</Button>
                      <p className="text-[10px] text-muted-foreground mt-1">PNG or JPG, max 2MB</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">First name</Label><Input defaultValue={firstName} className="h-8 text-sm bg-muted/40" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Last name</Label><Input defaultValue={lastName} className="h-8 text-sm bg-muted/40" /></div>
                    <div className="space-y-1.5 col-span-2"><Label className="text-xs">Email</Label><Input defaultValue={email} readOnly className="h-8 text-sm bg-muted/40 opacity-60" /></div>
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
                  <Input defaultValue={activeBrain?.name || ""} className="h-8 text-sm bg-muted/40 max-w-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Base model</Label>
                  <Select defaultValue="gpt4omini">
                    <SelectTrigger className="h-8 text-sm bg-muted/40 max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt4o">GPT-4o</SelectItem>
                      <SelectItem value="gpt4omini">GPT-4o mini</SelectItem>
                      <SelectItem value="gpt35">GPT-3.5 Turbo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator className="border-border" />
                {[
                  { id:"s1", label:"Auto-reflection after chat", sub:"Summarize learnings post-conversation", def:true },
                  { id:"s2", label:"Knowledge graph updates", sub:"Extract entities during training",         def:true },
                  { id:"s3", label:"Personality injection",    sub:"Inject style profile into system prompt", def:true },
                  { id:"s4", label:"Memory decay",             sub:"Reduce confidence of unused memories",    def:false },
                ].map(({ id, label, sub, def }) => (
                  <div key={id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{sub}</p>
                    </div>
                    <Switch defaultChecked={def} />
                  </div>
                ))}
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
                  <Select defaultValue="all">
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
                  { label:"Database encryption",    sub:"Supabase encrypts data at rest using AES-256",       checked:true,  locked:true },
                  { label:"Row-level security",   sub:"Supabase RLS ensures you only see your data",      checked:true,  locked:true },
                  { label:"Consent confirmation",  sub:"Require confirmation before training new data",    checked:false, locked:false },
                ].map(({ label, sub, checked, locked }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm flex items-center gap-2">
                        {label}
                        {locked && <Badge variant="outline" className="text-[9px] border-emerald-400/30 text-emerald-400">enforced</Badge>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{sub}</p>
                    </div>
                    <Switch defaultChecked={checked} disabled={locked} />
                  </div>
                ))}
                <Separator className="border-border" />
                <div className="space-y-1.5">
                  <Label className="text-xs">Change password</Label>
                  <Input type="password" placeholder="New password" className="h-8 text-sm bg-muted/40 max-w-xs" />
                </div>
              </CardContent>
            </Card>
          )}

          {active === "notifications" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-medium">Notifications</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {[
                  { label:"Training completed",       sub:"When a file finishes processing",           def:true  },
                  { label:"Reflection insights",      sub:"After post-conversation reflection",        def:false },
                  { label:"Low confidence warnings",  sub:"When memory confidence drops below 40%",   def:true  },
                  { label:"Knowledge gap alerts",     sub:"When major gaps are detected",              def:false },
                  { label:"Weekly brain report",      sub:"Summary email every Monday",               def:true  },
                ].map(({ label, sub, def }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{sub}</p>
                    </div>
                    <Switch defaultChecked={def} />
                  </div>
                ))}
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
                  <p>User ID: <span className="text-foreground font-mono">{user?.id || "—"}</span></p>
                  <p>Provider: <span className="text-foreground font-mono">Supabase Auth (email)</span></p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                  <p className="text-foreground/60">{"//"} Example: query your brain via API</p>
                  <p><span className="text-sky-400">POST</span> /api/chat</p>
                  <p>Content-Type: application/json</p>
                  <p>{"{"} {'"'}brainId{'"'}: {'"'}{activeBrainId || "..."}{'"'}, {'"'}message{'"'}: {'"'}What is backprop?{'"'} {"}"}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} size="sm" className="h-8 text-xs gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {saved ? "Saved!" : "Save changes"}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
