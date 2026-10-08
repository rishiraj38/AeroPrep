'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold text-white">Something went wrong</h1>
      <p className="max-w-md text-light-400">
        This page hit a problem. Nothing you did in an interview is lost: it is saved on our side as you go.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button onClick={() => retry()} className="btn-primary cursor-pointer">Try again</button>
        <Link href="/" className="btn-secondary">Back to the home page</Link>
      </div>
    </div>
  )
}
