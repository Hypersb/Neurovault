-- Neurovault-app migration: align pgvector dimension with gemini-embedding-001 (3072)
-- Run in Supabase SQL editor before deploying the updated app code.

BEGIN;

-- 1) Old vectors were created as vector(1536). Clear stale vectors before type change.
-- Re-embedding is required after this migration.
UPDATE memories
SET embedding = NULL
WHERE embedding IS NOT NULL;

-- 2) Move storage column to 3072 dimensions.
ALTER TABLE memories
ALTER COLUMN embedding TYPE vector(3072);

-- 3) Recreate similarity function with matching query vector shape.
DROP FUNCTION IF EXISTS match_memories(vector(1536), uuid, float, int);

CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(3072),
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

COMMIT;
