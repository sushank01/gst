'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from '../lib/auth'
import { ThemeProvider } from '../lib/theme'
import { WorkspaceProvider } from '../lib/workspace'

/** The three context providers the whole app runs inside, as `main.tsx` had them. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
