import Link from 'next/link'

export default function NotFound() {
  return <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
    <section className="max-w-md text-center">
      <p className="text-sm font-semibold text-accent">404</p>
      <h1 className="mt-3 text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-fg-muted">This address does not match a page. Check the link or return to the homepage.</p>
      <Link href="/" className="mt-6 inline-flex rounded-xl bg-accent px-5 py-3 font-semibold text-white">Back to home</Link>
    </section>
  </main>
}
