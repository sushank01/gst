import type { ReactNode } from 'react'
import { PortalLayout } from '../../../components/PortalLayout'
import { portalBySlug } from '../../../lib/appNav'

export default function MeLayout({ children }: { children: ReactNode }) {
  return <PortalLayout portal={portalBySlug.get('me')!}>{children}</PortalLayout>
}
