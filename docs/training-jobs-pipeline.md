# Training Background-Job Pipeline Plan

## Goals

- Remove long-running work from request handlers.
- Add robust retries with idempotency.
- Keep existing training UX (progress + status list).
- Make deployment compatible with Vercel + Supabase + external worker.

## Implementation Plan

1. Extend `training_jobs` schema:
   - idempotency key
   - attempt/retry scheduling fields
   - lock ownership fields
   - lifecycle timestamps
2. Introduce a training state machine utility for status transitions and retry backoff.
3. Refactor training service:
   - idempotent `createTrainingJob`
   - enqueue helper
   - job claim helper (with stale-lock recovery)
   - worker-safe `processTrainingJob`
   - retry/failure resolution
4. Update API route to enqueue only (`POST /api/train/[brainId]/jobs`).
5. Add dedicated worker entrypoint (`npm run worker:train`).
6. Keep frontend polling unchanged structurally, but show retry/attempt details.
7. Add automated test for state transitions and retry delay behavior.
8. Document local runbook, deployment topology, and rollback steps.

## Operational Notes

- Web/API nodes and worker nodes can scale independently.
- Worker process is stateless; queue state is in Postgres.
- Retry backoff is exponential with a bounded maximum delay.
- Jobs that exceed `max_attempts` are marked `failed` and stop retrying.

## Data Safety Notes

- Duplicate request protection via `(brain_id, idempotency_key)` unique constraint.
- Retry idempotency is enforced by deleting prior memory chunks tagged with `job:<id>` before rerun.
- Progress/status fields are persisted after each phase for resilient polling UX.
