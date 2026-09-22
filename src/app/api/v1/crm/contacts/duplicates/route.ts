import { tenantRoute } from '../../../../../../server/http/handler.ts'
import { duplicateParties } from '../../../../../../server/services/crm.ts'

/**
 * People who share a name with another person in this workspace.
 *
 * Tenant-wide, so the count means something: the browser could only ever
 * compare the page it had loaded. Addresses cannot collide — a unique index
 * already prevents one being used twice — so a duplicate here is a name.
 */
export const GET = tenantRoute(async ({ ctx }) => {
  const { groups, total } = await duplicateParties(ctx, 'person')
  return { body: { groups, total } }
})
