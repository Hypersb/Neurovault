import { randomUUID } from 'crypto'
import { processNextTrainingJob } from '../lib/services/training'
import { logger } from '../lib/utils/logger'
import { sleep } from '../lib/utils'
import { env } from '../lib/config/env-server'

const WORKER_ID = env.TRAINING_WORKER_ID ?? `train-worker-${randomUUID().slice(0, 8)}`
const IDLE_POLL_MS = env.TRAINING_WORKER_IDLE_POLL_MS
const ERROR_POLL_MS = env.TRAINING_WORKER_ERROR_POLL_MS

let stopping = false

async function run() {
  logger.info('Training worker started', {
    workerId: WORKER_ID,
    idlePollMs: IDLE_POLL_MS,
  })

  while (!stopping) {
    try {
      const processed = await processNextTrainingJob(WORKER_ID)

      if (!processed) {
        await sleep(IDLE_POLL_MS)
      }
    } catch (err) {
      logger.error('Training worker loop error', {
        workerId: WORKER_ID,
        error: String(err),
      })
      await sleep(ERROR_POLL_MS)
    }
  }

  logger.info('Training worker stopped', { workerId: WORKER_ID })
}

function requestStop(signal: string) {
  logger.info('Received worker shutdown signal', { signal, workerId: WORKER_ID })
  stopping = true
}

process.on('SIGINT', () => requestStop('SIGINT'))
process.on('SIGTERM', () => requestStop('SIGTERM'))

run().catch((err) => {
  logger.error('Training worker fatal error', {
    workerId: WORKER_ID,
    error: String(err),
  })
  process.exit(1)
})
