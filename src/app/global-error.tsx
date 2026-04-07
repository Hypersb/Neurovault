'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body className="p-6">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-gray-600">
          The incident has been logged. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded bg-black px-4 py-2 text-white"
        >
          Retry
        </button>
      </body>
    </html>
  )
}
