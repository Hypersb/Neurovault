# NeuroVault V2 Launch Checklist (Private Alpha)

Target window: 1-2 weeks

## Go/No-Go Criteria

- [ ] `npm run lint` passes on `main`
- [ ] `npm run build` passes on `main`
- [ ] `npm run test` passes on `main`
- [ ] CI workflow is green on the launch commit
- [ ] Sentry DSN configured for server and client
- [ ] Required env vars validated in staging and production
- [ ] Training worker deployed and processing jobs
- [ ] Rollback owner and rollback steps confirmed

## Product Readiness

- [ ] Auth login/signup flow validated end-to-end
- [ ] Brain creation, update, delete flows validated
- [ ] Chat endpoint tested with at least one seeded brain
- [ ] Training upload validation tested for PDF, DOCX, TXT, audio
- [ ] Failure states show actionable errors (not generic 500-only)

## Operational Readiness

- [ ] Alert channel defined (Slack/email/on-call)
- [ ] Sentry project has environment tags (`staging`, `production`)
- [ ] Error-rate threshold defined for rollback trigger
- [ ] Worker restart procedure documented and tested once
- [ ] Data backup/snapshot strategy confirmed with Supabase

## Security & Data Safety

- [ ] Production secrets stored in platform secret manager only
- [ ] No secrets in repo, issues, or logs
- [ ] Encryption key length and format validated (64 hex chars)
- [ ] Supabase service role key scoped and rotated if older than policy
- [ ] API routes enforce auth and reject unauthorized requests

## Dry Run (Required)

- [ ] Perform one staging dry run from upload to completed training job
- [ ] Simulate one worker failure and verify retry/backoff behavior
- [ ] Simulate one bad file upload and verify validation failure handling
- [ ] Validate dashboard health page shows expected state

## Launch Day

- [ ] Tag release commit
- [ ] Deploy web app
- [ ] Deploy worker
- [ ] Run post-deploy smoke suite
- [ ] Monitor errors and job throughput for first 2 hours

## 24-Hour Follow-Up

- [ ] Review new errors and triage top 5 by impact
- [ ] Review worker queue latency and retry rates
- [ ] Capture alpha feedback and open stabilization issues
