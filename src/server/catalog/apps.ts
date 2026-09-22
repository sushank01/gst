/**
 * The application catalogue, as the SERVER knows it.
 *
 * The browser has its own copy in `src/lib/appData.ts` for rendering the
 * marketplace, but a client list cannot gate anything — whoever holds the
 * browser can edit it. Entitlement decisions are made against this list.
 *
 * `gated` means the application is visible in the catalogue but not releasable:
 * it has no implementation behind it yet. Installing one is refused with that
 * reason rather than quietly succeeding and presenting an empty shell, which is
 * what the prototype did. Which of these become releasable is decision D2 in
 * `docs/implementation/decisions.md`; this file is the mechanism, not the answer.
 */

export type CatalogApp = {
  code: string
  name: string
  /** False until there is a real implementation behind the code. */
  releasable: boolean
}

export const CATALOG: CatalogApp[] = [
  { code: 'CRM', name: 'CRM', releasable: true },
  { code: 'HR', name: 'HR & People Ops', releasable: true },
  { code: 'SUP', name: 'Support & Ticketing', releasable: true },
  { code: 'POS', name: 'Sales & POS', releasable: true },
  { code: 'ITAM', name: 'Asset Management', releasable: true },
  { code: 'TE', name: 'Travel & Expense', releasable: true },
  { code: 'PP', name: 'Pitch Pilot', releasable: false },
  { code: 'INV', name: 'Inventory & Warehousing', releasable: false },
  { code: 'PM', name: 'Project Management', releasable: false },
  { code: 'P2P', name: 'Purchase & Payables', releasable: false },
  { code: 'CTR', name: 'Contract Management', releasable: false },
  { code: 'PPTX', name: 'PPTX Generator', releasable: false },
  { code: 'MFG', name: 'Manufacturing', releasable: false },
  { code: 'IDP', name: 'Intelligent Document Processing', releasable: false },
  { code: 'PAY', name: 'Payroll', releasable: false },
]

const BY_CODE = new Map(CATALOG.map((app) => [app.code, app]))

export const appInCatalog = (code: string): CatalogApp | undefined => BY_CODE.get(code)
