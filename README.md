# NeuroVault

NeuroVault is a Next.js + Supabase app for building and training personal AI brains.

## Training Pipeline Architecture

Training now runs as a durable background-job pipeline:

1. Upload file to Supabase Storage from the client.
2. Create job via `POST /api/train/[brainId]/jobs`.
3. API stores an idempotent job row and enqueues it (`status=queued`).
4. External worker claims one queued job at a time (with lock + retry control).
5. Worker executes parsing -> embedding -> extracting -> graph-update.
6. Worker updates progress/status in `training_jobs`.
7. Client polls `GET /api/train/[brainId]/jobs` and renders live progress.

This keeps request handlers short and Vercel-safe.

## Job State Model

`training_jobs.status` values:

- `queued`
- `retrying`
- `parsing`
- `embedding`
- `extracting`
- `graph-update`
- `completed`
- `failed`

Reliability fields include:

- `idempotency_key`
- `attempt_count`
- `max_attempts`
- `next_attempt_at`
- `locked_at`
- `locked_by`
- `last_error_code`
- `started_at`
- `completed_at`

## Why This Is Production-Safe

- No long synchronous work in API route handlers.
- Idempotent create requests using `(brain_id, idempotency_key)` unique key.
- Worker retries with exponential backoff.
- Stale-lock recovery for dead workers.
- Clear terminal states: `completed`, `failed`.
- Progress is persisted and queryable for UI polling.
- Retry runs clear prior memory chunks created by the same job tag (`job:<id>`) to prevent duplicate inserts.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables (same as deployment):

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ENCRYPTION_KEY`
- `SENTRY_DSN` (optional but recommended)
- `NEXT_PUBLIC_SENTRY_DSN` (optional but recommended)

Use `.env.example` as the template and validate configuration:

```bash
npm run env:check
```

3. Apply database setup/migration:

- Fresh setup: run `drizzle/setup.sql` in Supabase SQL editor.
- Existing DB upgrade: run `drizzle/0001_training_jobs_background_queue.sql`.

4. Run app server:

```bash
npm run dev
```

5. Run background worker in a second terminal:

```bash
npm run worker:train
```

Optional worker env tuning:

- `TRAINING_WORKER_ID`
- `TRAINING_WORKER_IDLE_POLL_MS`
- `TRAINING_WORKER_ERROR_POLL_MS`

## Deployment (Vercel + Supabase + External Worker)

1. Deploy web app/API on Vercel.
2. Keep `POST /api/train/[brainId]/jobs` enqueue-only.
3. Deploy worker (`npm run worker:train`) on an always-on service (Railway, Render, Fly, ECS, etc.).
4. Point worker at the same `DATABASE_URL` and Supabase/OpenAI env vars.
5. Scale workers horizontally if needed; lock + claim logic prevents duplicate claims.

## Verification Commands

```bash
npm run lint
npm run build
npm run test
```

## Alpha Launch Docs

- Launch checklist: `docs/launch-checklist.md`
- Release checklist: `docs/release-checklist.md`
- Launch risk checklist: `docs/launch-risk-checklist.md`
- Developer setup: `docs/developer-setup.md`
- Migration and deployment: `docs/migration-deployment.md`

## Rollback Plan

If background worker rollout needs rollback:

1. Stop external workers.
2. Keep API enqueue route active so no training data is lost.
3. Revert app code to previous release.
4. Optionally reprocess queued/retrying jobs after redeploy by restarting workers.

If migration rollback is required:

1. Remove workers first.
2. Drop new indexes/columns only after confirming no code path depends on them.
3. Redeploy previous app revision.

Recommended: treat schema rollback as a maintenance operation with backups/snapshots enabled.
