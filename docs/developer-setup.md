# NeuroVault Developer Setup

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase project (or equivalent DB/storage setup)

## 1. Install

```bash
npm ci
```

## 2. Configure Environment

Create local env from template and fill real values:

```bash
cp .env.example .env.local
```

Required keys:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ENCRYPTION_KEY` (64 hex chars)

Optional but recommended:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`

Validate env:

```bash
npm run env:check
```

## 3. Database Setup

- Fresh setup: execute `drizzle/setup.sql`.
- Existing DB: run migration(s) in `drizzle/`.

## 4. Run Locally

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run worker:train
```

## 5. Quality Checks

```bash
npm run lint
npm run build
npm run test
```

## Troubleshooting

- If `env:check` fails, verify key names and URL formats.
- If training jobs do not progress, verify worker terminal output and DB connectivity.
- If uploads fail, verify Supabase public storage path and file type limits.
