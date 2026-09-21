import type { NextConfig } from 'next'

const config: NextConfig = {
  // Every screen is client-rendered against localStorage, so there is nothing
  // for the server to personalise — but keeping the default runtime means the
  // marketing pages still ship as static HTML.
  reactStrictMode: true,
}

export default config
