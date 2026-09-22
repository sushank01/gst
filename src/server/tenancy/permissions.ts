/**
 * Role → permission mapping.
 *
 * Permissions are checked on the server against the membership row for the
 * session's tenant. The UI may hide whatever it likes; hiding is not a control,
 * so every mutation re-checks here.
 */

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'tenant.read', 'tenant.manage', 'tenant.delete',
  'member.read', 'member.invite', 'member.manage', 'member.remove',
  'company.read', 'company.manage',
  'app.read', 'app.install', 'app.uninstall',
  'record.read', 'record.create', 'record.update', 'record.archive', 'record.delete',
  'record.export', 'record.import',
  'approval.read', 'approval.decide',
  'settings.read', 'settings.manage',
  'audit.read',
  'billing.read', 'billing.manage',
  'credit.spend',
  'job.read', 'job.manage', 'job.run',
  'connector.read', 'connector.manage',
  'portal.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const VIEWER: Permission[] = [
  'tenant.read', 'member.read', 'company.read', 'app.read', 'record.read',
  'approval.read', 'settings.read', 'job.read', 'connector.read',
]

const MEMBER: Permission[] = [
  ...VIEWER,
  'record.create', 'record.update', 'record.archive', 'record.export', 'record.import',
  'credit.spend', 'job.run',
]

const ADMIN: Permission[] = [
  ...MEMBER,
  'tenant.manage', 'member.invite', 'member.manage', 'member.remove',
  'company.manage', 'app.install', 'app.uninstall',
  'approval.decide', 'settings.manage', 'audit.read',
  'billing.read', 'job.manage', 'connector.manage', 'portal.manage',
  // Hard delete stays with the owner: an admin archives, an owner destroys.
]

const OWNER: Permission[] = [...ADMIN, 'tenant.delete', 'record.delete', 'billing.manage']

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  viewer: new Set(VIEWER),
  member: new Set(MEMBER),
  admin: new Set(ADMIN),
  owner: new Set(OWNER),
}

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}
