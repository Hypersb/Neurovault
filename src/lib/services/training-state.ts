import type { TrainingJobStatus } from '@/types'

const TERMINAL: TrainingJobStatus[] = ['completed', 'failed']

const ALLOWED_TRANSITIONS: Record<TrainingJobStatus, TrainingJobStatus[]> = {
  queued: ['parsing', 'retrying', 'failed'],
  retrying: ['parsing', 'failed'],
  parsing: ['embedding', 'retrying', 'failed'],
  embedding: ['extracting', 'retrying', 'failed'],
  extracting: ['graph-update', 'retrying', 'failed'],
  'graph-update': ['completed', 'retrying', 'failed'],
  completed: [],
  failed: [],
}

export function isTerminalTrainingStatus(status: TrainingJobStatus): boolean {
  return TERMINAL.includes(status)
}

export function canTransitionTrainingStatus(
  from: TrainingJobStatus,
  to: TrainingJobStatus
): boolean {
  if (from === to) return true
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function calculateTrainingRetryDelayMs(attempt: number): number {
  const baseMs = 15_000
  const maxMs = 10 * 60_000
  const exp = Math.max(0, attempt - 1)
  return Math.min(maxMs, baseMs * Math.pow(2, exp))
}
