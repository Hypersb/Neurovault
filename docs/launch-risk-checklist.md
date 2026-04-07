# NeuroVault V2 Launch Risk Checklist

## High-Risk Areas

- [ ] Environment mismatch between web app and worker
- [ ] Missing/invalid encryption key
- [ ] Worker not running or silently failing
- [ ] Supabase storage URL bypass attempts
- [ ] OpenAI/API quota exhaustion
- [ ] New migration causing query regression

## Risk Controls

- [ ] `npm run env:check` executed in CI and deploy pipelines
- [ ] Sentry enabled for both server and client
- [ ] Worker logs centralized and searchable
- [ ] Retry backoff caps validated under repeated failure
- [ ] Upload validation rejects unsupported types/oversized files

## Trigger Conditions (Rollback or Hotfix)

- [ ] Auth failure rate > 2% over 10 minutes
- [ ] API 5xx rate > 1% over 15 minutes
- [ ] Queue lag > 30 minutes for normal traffic
- [ ] Repeated worker fatal restarts (>3 in 30 minutes)
- [ ] Data integrity issues (duplicate/corrupt memory writes)

## Mitigations Ready

- [ ] Disable training intake if worker is unhealthy
- [ ] Scale worker replicas if queue lag grows
- [ ] Revert to last stable app release
- [ ] Pause and review recent migration if DB latency spikes
- [ ] Rotate leaked/compromised keys immediately

## Owners

- [ ] Engineering owner assigned
- [ ] Incident communicator assigned
- [ ] Database/Supabase owner assigned
- [ ] Worker operations owner assigned
