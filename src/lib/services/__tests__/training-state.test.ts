import { describe, expect, it } from 'vitest'
import {
  calculateTrainingRetryDelayMs,
  canTransitionTrainingStatus,
  isTerminalTrainingStatus,
} from '../training-state'

describe('training job state transitions', () => {
  it('allows valid pipeline transitions and blocks invalid ones', () => {
    expect(canTransitionTrainingStatus('queued', 'parsing')).toBe(true)
    expect(canTransitionTrainingStatus('parsing', 'embedding')).toBe(true)
    expect(canTransitionTrainingStatus('embedding', 'extracting')).toBe(true)
    expect(canTransitionTrainingStatus('extracting', 'graph-update')).toBe(true)
    expect(canTransitionTrainingStatus('graph-update', 'completed')).toBe(true)

    expect(canTransitionTrainingStatus('queued', 'completed')).toBe(false)
    expect(canTransitionTrainingStatus('completed', 'parsing')).toBe(false)
    expect(canTransitionTrainingStatus('failed', 'retrying')).toBe(false)
  })

  it('marks only completed and failed as terminal', () => {
    expect(isTerminalTrainingStatus('queued')).toBe(false)
    expect(isTerminalTrainingStatus('parsing')).toBe(false)
    expect(isTerminalTrainingStatus('retrying')).toBe(false)
    expect(isTerminalTrainingStatus('completed')).toBe(true)
    expect(isTerminalTrainingStatus('failed')).toBe(true)
  })

  it('backs off retry delay exponentially with cap', () => {
    const first = calculateTrainingRetryDelayMs(1)
    const second = calculateTrainingRetryDelayMs(2)
    const third = calculateTrainingRetryDelayMs(3)
    const large = calculateTrainingRetryDelayMs(10)

    expect(first).toBe(15000)
    expect(second).toBe(30000)
    expect(third).toBe(60000)
    expect(large).toBe(600000)
  })
})
