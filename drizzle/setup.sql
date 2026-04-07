-- ============================================================
-- NeuroVault – Complete Database Setup
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Brains ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_legacy BOOLEAN DEFAULT false NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  personality_profile JSONB,
  token_usage INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ─── Brain Snapshots ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_data JSONB NOT NULL,
  label VARCHAR(200),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ─── Long-Term Memory ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  encrypted_content TEXT NOT NULL,
  embedding VECTOR(1536),
  source_type VARCHAR(50) NOT NULL,
  confidence_score REAL DEFAULT 0.8 NOT NULL,
  usage_count INTEGER DEFAULT 0 NOT NULL,
  last_accessed TIMESTAMP WITH TIME ZONE,
  metadata_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ─── Concepts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS concepts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  domain VARCHAR(100),
  importance_score REAL DEFAULT 0.5 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ─── Relationships ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  source_concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relationship_type VARCHAR(100) NOT NULL,
  strength REAL DEFAULT 0.5 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ─── Conversations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]' NOT NULL,
  summary TEXT,
  total_tokens INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ─── Training Jobs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  file_url TEXT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  status VARCHAR(30) DEFAULT 'queued' NOT NULL,
  progress REAL DEFAULT 0 NOT NULL,
  error_message TEXT,
  last_error_code VARCHAR(80),
  attempt_count INTEGER DEFAULT 0 NOT NULL,
  max_attempts INTEGER DEFAULT 3 NOT NULL,
  next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by VARCHAR(120),
  chunks_processed INTEGER DEFAULT 0 NOT NULL,
  total_chunks INTEGER DEFAULT 0 NOT NULL,
  memory_created INTEGER DEFAULT 0 NOT NULL,
  concepts_extracted INTEGER DEFAULT 0 NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ─── Token Usage Logs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  brain_id UUID REFERENCES brains(id) ON DELETE SET NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  model VARCHAR(50) NOT NULL,
  operation VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS memories_brain_idx ON memories (brain_id);
CREATE INDEX IF NOT EXISTS concepts_brain_idx ON concepts (brain_id);
CREATE INDEX IF NOT EXISTS relationships_brain_idx ON relationships (brain_id);
CREATE INDEX IF NOT EXISTS training_jobs_brain_created_idx ON training_jobs (brain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS training_jobs_status_next_attempt_idx ON training_jobs (status, next_attempt_at);
CREATE UNIQUE INDEX IF NOT EXISTS training_jobs_brain_idempotency_key_uidx ON training_jobs (brain_id, idempotency_key);

-- HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS memories_embedding_hnsw_idx
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Row-Level Security ───────────────────────────────────────
ALTER TABLE brains ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage_logs ENABLE ROW LEVEL SECURITY;

-- Brains: users can only access their own
CREATE POLICY "brains_own" ON brains
  USING (user_id = auth.uid());

-- Brain snapshots: through brain ownership
CREATE POLICY "snapshots_own" ON brain_snapshots
  USING (brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid()));

-- Memories: through brain ownership
CREATE POLICY "memories_own" ON memories
  USING (brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid()));

-- Concepts: through brain ownership
CREATE POLICY "concepts_own" ON concepts
  USING (brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid()));

-- Relationships: through brain ownership
CREATE POLICY "relationships_own" ON relationships
  USING (brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid()));

-- Conversations: through brain ownership
CREATE POLICY "conversations_own" ON conversations
  USING (brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid()));

-- Training jobs: through brain ownership
CREATE POLICY "training_jobs_own" ON training_jobs
  USING (brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid()));

-- Token logs: user's own
CREATE POLICY "token_logs_own" ON token_usage_logs
  USING (user_id = auth.uid());

-- ─── Supabase Storage Bucket ──────────────────────────────────
-- Run this separately or via Supabase Dashboard:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('training-files', 'training-files', true);

-- Storage RLS for training-files bucket
-- CREATE POLICY "training_files_upload" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'training-files' AND auth.uid()::text = (storage.foldername(name))[1]);
