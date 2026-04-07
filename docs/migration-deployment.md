# NeuroVault Migration and Deployment Guide

## Scope

This guide targets private alpha deployment with safe rollback in 1-2 weeks.

## 1. Pre-Deployment

- Ensure release branch is CI green.
- Ensure secrets are configured in deployment platforms.
- Run `npm run env:check` in the target environment.

## 2. Database Migration

1. Backup/snapshot database.
2. Apply pending SQL migration files from `drizzle/`.
3. Verify `training_jobs` and related indexes exist as expected.
4. Validate read/write health with a lightweight smoke query.

## 3. Deploy Web App (Vercel)

1. Deploy the release commit.
2. Confirm these env vars are set:
   - `DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `ENCRYPTION_KEY`
   - `SENTRY_DSN` (recommended)
   - `NEXT_PUBLIC_SENTRY_DSN` (recommended)
3. Verify health route and authentication flow.

## 4. Deploy Training Worker

1. Deploy `npm run worker:train` to an always-on runtime.
2. Use the same DB/Supabase/OpenAI/env config as web app.
3. Confirm one job can be claimed and processed.
4. Set restart policy on crash.

## 5. Post-Deployment Smoke Test

- Create/login user.
- Create brain.
- Upload and train one file.
- Verify job transitions to `completed`.
- Send one chat prompt and verify response.
- Confirm no critical Sentry errors.

## 6. Rollback

If launch quality degrades beyond agreed thresholds:

1. Stop worker process.
2. Revert web app to previous stable release.
3. Re-run smoke checks on rolled-back release.
4. Decide whether DB rollback is required.

Notes:

- Prefer forward-fix over schema rollback when possible.
- Perform destructive schema rollback only with confirmed backups and downtime approval.
