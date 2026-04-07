# NeuroVault V2 Release Checklist

## Before Cut

- [ ] Merge only launch-critical PRs
- [ ] Freeze schema changes unless critical
- [ ] Confirm CI green on release branch
- [ ] Confirm environment validation passes in target environments

## Release Candidate Validation

- [ ] Run `npm run lint`
- [ ] Run `npm run build`
- [ ] Run `npm run test`
- [ ] Run worker locally against staging data once
- [ ] Verify Sentry captures a test error in staging

## Deployment

- [ ] Apply required database migration(s)
- [ ] Deploy web app (Vercel)
- [ ] Deploy training worker (always-on runtime)
- [ ] Confirm worker connectivity to DB, Supabase, OpenAI

## After Deployment

- [ ] Execute smoke tests for auth, train, chat, dashboard
- [ ] Check Sentry for startup/runtime exceptions
- [ ] Confirm no queue growth for more than 15 minutes
- [ ] Confirm no spike in 5xx API responses

## Rollback Readiness

- [ ] Previous stable app revision identified
- [ ] Worker stop command ready
- [ ] Rollback owner assigned
- [ ] Decision threshold documented (error rate, queue lag, auth failures)
