"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────
export interface Brain {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_frozen: boolean;
  personality_profile: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Memory {
  id: string;
  brain_id: string;
  content: string;
  source_type: string;
  confidence_score: number;
  usage_count: number;
  last_accessed: string;
  domain: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TrainingJob {
  id: string;
  brain_id: string;
  file_name: string;
  file_type: string;
  file_size: string;
  status: string;
  progress: number;
  stage: string;
  error_message: string | null;
  memories_created: number;
  concepts_created: number;
  created_at: string;
}

export interface Concept {
  id: string;
  brain_id: string;
  name: string;
  description: string | null;
  domain: string | null;
  importance_score: number;
  created_at: string;
}

export interface Relationship {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  relationship_type: string;
  strength: number;
}

// ─── Brain Context ─────────────────────────────────
interface BrainContextValue {
  activeBrainId: string | null;
  setActiveBrainId: (id: string) => void;
  brains: Brain[];
  isLoading: boolean;
}

const BrainContext = createContext<BrainContextValue>({
  activeBrainId: null,
  setActiveBrainId: () => {},
  brains: [],
  isLoading: true,
});

export function useBrainContext() {
  return useContext(BrainContext);
}

export function BrainProvider({ children }: { children: React.ReactNode }) {
  const [activeBrainId, setActiveBrainId] = useState<string | null>(null);

  const { data: brains = [], isLoading } = useQuery<Brain[]>({
    queryKey: ["brains"],
    queryFn: async () => {
      const res = await fetch("/api/brains");
      if (!res.ok) throw new Error("Failed to fetch brains");
      return res.json();
    },
  });

  useEffect(() => {
    if (brains.length > 0 && !activeBrainId) {
      setActiveBrainId(brains[0].id);
    }
  }, [brains, activeBrainId]);

  return (
    <BrainContext.Provider value={{ activeBrainId, setActiveBrainId, brains, isLoading }}>
      {children}
    </BrainContext.Provider>
  );
}

// ─── Auth Hook ─────────────────────────────────────
export function useUser() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });
}

export function useLogout() {
  const supabase = createClient();
  return useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);
}

// ─── Brains ────────────────────────────────────────
export function useCreateBrain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch("/api/brains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create brain");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brains"] }),
  });
}

// ─── Memories ──────────────────────────────────────
export function useMemories(brainId: string | null, query?: string, domain?: string, sort?: string) {
  return useQuery({
    queryKey: ["memories", brainId, query, domain, sort],
    enabled: !!brainId,
    queryFn: async () => {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brainId, query, domain, sort }),
      });
      if (!res.ok) throw new Error("Failed to fetch memories");
      return res.json() as Promise<{ memories: Memory[]; domains: string[]; total: number }>;
    },
  });
}

// ─── Training Jobs ─────────────────────────────────
export function useTrainingJobs(brainId: string | null) {
  return useQuery<TrainingJob[]>({
    queryKey: ["training-jobs", brainId],
    enabled: !!brainId,
    refetchInterval: 3000, // Poll every 3s for in-progress jobs
    queryFn: async () => {
      const res = await fetch(`/api/train?brainId=${brainId}`);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
  });
}

export function useUploadTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, brainId }: { file: File; brainId: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("brainId", brainId);
      const res = await fetch("/api/train", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (_, { brainId }) => {
      qc.invalidateQueries({ queryKey: ["training-jobs", brainId] });
    },
  });
}

// ─── Knowledge Graph ───────────────────────────────
export function useKnowledgeGraph(brainId: string | null) {
  return useQuery({
    queryKey: ["graph", brainId],
    enabled: !!brainId,
    queryFn: async () => {
      const res = await fetch(`/api/graph?brainId=${brainId}`);
      if (!res.ok) throw new Error("Failed to fetch graph");
      return res.json() as Promise<{ concepts: Concept[]; relationships: Relationship[] }>;
    },
  });
}

// ─── Brain Health ──────────────────────────────────
export function useBrainHealth(brainId: string | null) {
  return useQuery({
    queryKey: ["health", brainId],
    enabled: !!brainId,
    queryFn: async () => {
      const res = await fetch(`/api/health?brainId=${brainId}`);
      if (!res.ok) throw new Error("Failed to fetch health");
      return res.json();
    },
  });
}
