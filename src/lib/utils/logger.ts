// ============================================================
// Structured Logger
// ============================================================
type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  timestamp: string
  service: string
}

const REDACTED = '[REDACTED]'
const MAX_STRING_LENGTH = 500

function isSensitiveKey(key: string): boolean {
  return /(token|secret|password|authorization|cookie|api[-_]?key|openai|private|content|message|prompt|transcript)/i.test(
    key
  )
}

function sanitizeValue(value: unknown, keyHint?: string, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]'

  if (keyHint && isSensitiveKey(keyHint)) {
    return REDACTED
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, undefined, depth + 1))
  }

  if (value && typeof value === 'object') {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(
      ([key, nestedValue]) => [key, sanitizeValue(nestedValue, key, depth + 1)]
    )

    return Object.fromEntries(sanitizedEntries)
  }

  return value
}

function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined
  return sanitizeValue(context) as Record<string, unknown>
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    context: sanitizeContext(context),
    timestamp: new Date().toISOString(),
    service: 'neurovault',
  }

  if (process.env.NODE_ENV === 'production') {
    // In production, output JSON for log aggregation
    console[level === 'debug' ? 'log' : level](JSON.stringify(entry))
  } else {
    const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
    console[level === 'debug' ? 'log' : level](
      `[${entry.timestamp}] [${level.toUpperCase()}] ${message}${ctx}`
    )
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) =>
    log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    log('error', message, context),
  debug: (message: string, context?: Record<string, unknown>) =>
    log('debug', message, context),
}
