import { useMemo } from 'react'
import { useAuth } from '../../../lib/auth'
import { useWorkspace, type Company } from '../../../lib/workspace'

/**
 * The tenant's entity list: the primary company is derived from the org named at
 * signup (with any edits layered on), followed by entities the admin has added.
 */
export function useCompanies() {
  const { session } = useAuth()
  const { companies, primaryOverride } = useWorkspace()

  const orgName =
    session?.user.organization?.trim() ||
    session?.onboarding?.workspaceName?.trim() ||
    session?.user.fullName ||
    'Your company'

  return useMemo<Company[]>(() => {
    const primary: Company = {
      id: 'primary',
      name: orgName,
      code: orgName.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'ORG',
      currency: 'USD',
      country: 'US',
      parentId: null,
      status: 'ACTIVE',
      ...primaryOverride,
    }
    return [primary, ...companies]
  }, [orgName, primaryOverride, companies])
}
