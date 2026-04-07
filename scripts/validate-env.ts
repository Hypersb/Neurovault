import { env } from '../src/lib/config/env-server'

const requiredKeys: Array<keyof typeof env> = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'ENCRYPTION_KEY',
]

for (const key of requiredKeys) {
  if (!env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

console.log('Environment validation passed for NeuroVault.')
