import { Suspense, type ReactNode } from 'react'
import { AppShell } from '../../components/AppShell'
import { Protected } from '../../routes/Protected'

/**
 * Everything under /app shares the rail, the top bar and the copilot dock.
 *
 * The workspace reads its own URL — `?tab=`, `?s=`, `?category=` — and its
 * state lives in the browser, so there is nothing here for the server to
 * prerender. One boundary at the top says so, instead of thirty pages each
 * declaring it.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Protected requireOnboarding>
      <Suspense>
        <AppShell>{children}</AppShell>
      </Suspense>
    </Protected>
  )
}
