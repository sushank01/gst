'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from '../lib/auth'
import { ThemeProvider } from '../lib/theme'
import { WorkspaceProvider } from '../lib/workspace'
import { InstallationsProvider } from '../lib/useInstallations'

/** The context providers the whole app runs inside. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          {/*
            * Installed applications come from the server. One request for the
            * whole tree, so forty marketplace cards agree with each other and
            * with the dashboard.
            */}
          <InstallationsProvider>{children}</InstallationsProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
