-- Background queue support for training_jobs
-- Safe to run once in Supabase SQL editor.

ALTER TABLE training_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

UPDATE training_jobs
SET idempotency_key = md5(concat(brain_id::text, ':', file_name, ':', file_type, ':', file_url))
WHERE idempotency_key IS NULL;

ALTER TABLE training_jobs
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE training_jobs
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(120),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS training_jobs_brain_created_idx
  ON training_jobs (brain_id, created_at DESC);

CREATE INDEX IF NOT EXISTS training_jobs_status_next_attempt_idx
  ON training_jobs (status, next_attempt_at);

CREATE UNIQUE INDEX IF NOT EXISTS training_jobs_brain_idempotency_key_uidx
  ON training_jobs (brain_id, idempotency_key);

-- Existing in-flight jobs should be re-queued on migration.
UPDATE training_jobs
SET status = 'queued', locked_at = NULL, locked_by = NULL, next_attempt_at = NOW()
WHERE status NOT IN ('completed', 'failed');
