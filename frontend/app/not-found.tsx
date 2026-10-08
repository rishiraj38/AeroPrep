import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold text-white">Page not found</h1>
      <p className="max-w-md text-light-400">There is nothing at this address. It may have been mistyped, or the page may have moved.</p>
      <Link href="/" className="btn-primary">Back to the home page</Link>
    </div>
  )
}
