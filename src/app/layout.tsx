import type { Metadata } from 'next'
import Script from 'next/script'
import type { ReactNode } from 'react'
import { Providers } from './providers'
import { themeBootScript } from '../lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'Apragya AI — AI Operating System for Businesses',
  description:
    'Build agents in Vibe Studio, orchestrate them on the Agent Studio canvas, and ship 15+ ready-to-deploy enterprise apps.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Runs before hydration, so a dark reader never sees a white flash. */}
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
