-- NeuroVault Database Schema
-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Brains
CREATE TABLE IF NOT EXISTS brains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_frozen BOOLEAN DEFAULT false,
  personality_profile JSONB DEFAULT '{}',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Memories (with pgvector embedding)
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id UUID REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  encrypted_content TEXT,
  embedding vector(1536),
  source_type TEXT NOT NULL DEFAULT 'text',
  confidence_score FLOAT DEFAULT 0.8,
  usage_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  domain TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Concepts (Knowledge Graph nodes)
CREATE TABLE IF NOT EXISTS concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id UUID REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT,
  importance_score FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Relationships (Knowledge Graph edges)
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id UUID REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  source_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
  target_concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE NOT NULL,
  relationship_type TEXT NOT NULL,
  strength FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Training Jobs
CREATE TABLE IF NOT EXISTS training_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id UUID REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size TEXT,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  stage TEXT DEFAULT 'Queued',
  error_message TEXT,
  memories_created INTEGER DEFAULT 0,
  concepts_created INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id UUID REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Brain Snapshots
CREATE TABLE IF NOT EXISTS brain_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brain_id UUID REFERENCES brains(id) ON DELETE CASCADE NOT NULL,
  snapshot_data JSONB NOT NULL,
  version INTEGER NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Indexes
CREATE INDEX IF NOT EXISTS idx_memories_brain ON memories (brain_id);
CREATE INDEX IF NOT EXISTS idx_concepts_brain ON concepts (brain_id);
CREATE INDEX IF NOT EXISTS idx_relationships_brain ON relationships (brain_id);
CREATE INDEX IF NOT EXISTS idx_training_jobs_brain ON training_jobs (brain_id);
CREATE INDEX IF NOT EXISTS idx_conversations_brain ON conversations (brain_id);

-- 11. Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brains ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_snapshots ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Brains
CREATE POLICY "Users can view own brains" ON brains FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create brains" ON brains FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own brains" ON brains FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own brains" ON brains FOR DELETE USING (auth.uid() = user_id);

-- Memories
CREATE POLICY "Users can view own memories" ON memories FOR SELECT USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create memories" ON memories FOR INSERT WITH CHECK (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own memories" ON memories FOR UPDATE USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own memories" ON memories FOR DELETE USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);

-- Concepts
CREATE POLICY "Users can view own concepts" ON concepts FOR SELECT USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create concepts" ON concepts FOR INSERT WITH CHECK (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own concepts" ON concepts FOR UPDATE USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own concepts" ON concepts FOR DELETE USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);

-- Relationships
CREATE POLICY "Users can view own relationships" ON relationships FOR SELECT USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create relationships" ON relationships FOR INSERT WITH CHECK (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own relationships" ON relationships FOR DELETE USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);

-- Training Jobs
CREATE POLICY "Users can view own jobs" ON training_jobs FOR SELECT USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create jobs" ON training_jobs FOR INSERT WITH CHECK (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own jobs" ON training_jobs FOR UPDATE USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);

-- Conversations
CREATE POLICY "Users can view own conversations" ON conversations FOR SELECT USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create conversations" ON conversations FOR INSERT WITH CHECK (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own conversations" ON conversations FOR UPDATE USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);

-- Brain Snapshots
CREATE POLICY "Users can view own snapshots" ON brain_snapshots FOR SELECT USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create snapshots" ON brain_snapshots FOR INSERT WITH CHECK (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own snapshots" ON brain_snapshots FOR DELETE USING (
  brain_id IN (SELECT id FROM brains WHERE user_id = auth.uid())
);

-- 12. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 13. Similarity search function
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  match_brain_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_type TEXT,
  confidence_score FLOAT,
  usage_count INTEGER,
  domain TEXT,
  tags TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.source_type,
    m.confidence_score,
    m.usage_count,
    m.domain,
    m.tags,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM memories m
  WHERE m.brain_id = match_brain_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
