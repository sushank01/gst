# Existing workspace operation contract inventory

These are prototype client callbacks, not existing APIs. Each must be mapped to an authenticated domain command/query or removed only by explicit scope decision. DATA-API.md defines the replacement service constraints. Source-inventory.json retains their callback bodies and complete type schemas.

## setFlag

Source: src/lib/workspace.tsx:636

```ts
setFlag: (flag: 'creditsAllocated' | 'invitedTeammate' | 'usedCopilot' | 'dismissedChecklist', value?: boolean) => void
```

Consumers: src/components/CopilotDock.tsx, src/screens/app/Overview.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## setTwoFactor

Source: src/lib/workspace.tsx:637

```ts
setTwoFactor: (value: Persisted['twoFactor']) => void
```

Consumers: src/screens/app/Overview.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## markNotificationRead

Source: src/lib/workspace.tsx:639

```ts
markNotificationRead: (id: string) => void
```

Consumers: src/screens/app/workspace.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## markAllNotificationsRead

Source: src/lib/workspace.tsx:640

```ts
markAllNotificationsRead: () => void
```

Consumers: src/screens/app/workspace.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## notify

Source: src/lib/workspace.tsx:641

```ts
notify: (title: string, body: string) => void
```

Consumers: src/screens/app/travel/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## decideApproval

Source: src/lib/workspace.tsx:642

```ts
decideApproval: (id: string, decision: ApprovalDecision, agent: string) => void
```

Consumers: src/screens/app/Approvals.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## logAudit

Source: src/lib/workspace.tsx:643

```ts
logAudit: (event: AuditEvent) => void
```

Consumers: 

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addCompany

Source: src/lib/workspace.tsx:644

```ts
addCompany: (company: Omit<Company, 'id' | 'status'>) => void
```

Consumers: src/screens/app/setup/Companies.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addIntercompanyPair

Source: src/lib/workspace.tsx:645

```ts
addIntercompanyPair: (pair: Omit<IntercompanyPair, 'id'>) => void
```

Consumers: src/screens/app/setup/Companies.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateCompany

Source: src/lib/workspace.tsx:646

```ts
updateCompany: (id: string, patch: Partial<Company>) => void
```

Consumers: src/screens/app/setup/Companies.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addPolicy

Source: src/lib/workspace.tsx:647

```ts
addPolicy: (policy: Omit<GuardrailPolicy, 'id'>) => void
```

Consumers: src/screens/app/Guardrails.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updatePolicy

Source: src/lib/workspace.tsx:648

```ts
updatePolicy: (id: string, patch: Partial<GuardrailPolicy>) => void
```

Consumers: src/screens/app/Guardrails.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## deletePolicy

Source: src/lib/workspace.tsx:649

```ts
deletePolicy: (id: string) => void
```

Consumers: src/screens/app/Guardrails.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## pairRunner

Source: src/lib/workspace.tsx:650

```ts
pairRunner: (input: { name: string; description: string }) => Runner
```

Consumers: src/screens/app/Runners.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeRunner

Source: src/lib/workspace.tsx:651

```ts
removeRunner: (id: string) => void
```

Consumers: src/screens/app/Runners.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addConnection

Source: src/lib/workspace.tsx:652

```ts
addConnection: (input: Omit<Connection, 'id' | 'createdAt'>) => void
```

Consumers: src/screens/app/Integrations.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeConnection

Source: src/lib/workspace.tsx:653

```ts
removeConnection: (id: string) => void
```

Consumers: src/screens/app/Integrations.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addCustomConnector

Source: src/lib/workspace.tsx:654

```ts
addCustomConnector: (input: Omit<CustomConnector, 'id'>) => void
```

Consumers: src/screens/app/Integrations.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## setPortalTabs

Source: src/lib/workspace.tsx:655

```ts
setPortalTabs: (tabs: string[]) => void
```

Consumers: src/screens/app/ClientPortal.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addPortalRole

Source: src/lib/workspace.tsx:656

```ts
addPortalRole: (role: Omit<PortalRole, 'id'>) => void
```

Consumers: src/screens/app/ClientPortal.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removePortalRole

Source: src/lib/workspace.tsx:657

```ts
removePortalRole: (id: string) => void
```

Consumers: src/screens/app/ClientPortal.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addInventoryField

Source: src/lib/workspace.tsx:658

```ts
addInventoryField: (field: Omit<InventoryField, 'id'>) => void
```

Consumers: src/screens/app/ComplianceCenter.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateInventoryField

Source: src/lib/workspace.tsx:659

```ts
updateInventoryField: (id: string, patch: Partial<InventoryField>) => void
```

Consumers: src/screens/app/ComplianceCenter.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeInventoryField

Source: src/lib/workspace.tsx:660

```ts
removeInventoryField: (id: string) => void
```

Consumers: src/screens/app/ComplianceCenter.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addDataFlow

Source: src/lib/workspace.tsx:661

```ts
addDataFlow: (flow: Omit<DataFlow, 'id'>) => void
```

Consumers: src/screens/app/ComplianceCenter.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addDpia

Source: src/lib/workspace.tsx:662

```ts
addDpia: (dpia: Omit<Dpia, 'id'>) => void
```

Consumers: src/screens/app/ComplianceCenter.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addAutomatedDecision

Source: src/lib/workspace.tsx:663

```ts
addAutomatedDecision: (entry: Omit<AutomatedDecision, 'id'>) => void
```

Consumers: src/screens/app/ComplianceCenter.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addRetentionPolicy

Source: src/lib/workspace.tsx:664

```ts
addRetentionPolicy: (policy: Omit<RetentionPolicy, 'id'>) => void
```

Consumers: src/screens/app/ComplianceCenter.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeRetentionPolicy

Source: src/lib/workspace.tsx:665

```ts
removeRetentionPolicy: (id: string) => void
```

Consumers: src/screens/app/ComplianceCenter.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addExpenseReport

Source: src/lib/workspace.tsx:666

```ts
addExpenseReport: (report: Omit<ExpenseReport, 'id' | 'createdAt'>) => void
```

Consumers: src/screens/app/travel/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## advanceExpenseReport

Source: src/lib/workspace.tsx:667

```ts
advanceExpenseReport: (id: string) => void
```

Consumers: src/screens/app/travel/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addTravelRequest

Source: src/lib/workspace.tsx:668

```ts
addTravelRequest: (request: Omit<TravelRequest, 'id' | 'status'>) => void
```

Consumers: src/screens/app/travel/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## closeTravelRequest

Source: src/lib/workspace.tsx:669

```ts
closeTravelRequest: (id: string) => void
```

Consumers: src/screens/app/travel/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## importCardTransactions

Source: src/lib/workspace.tsx:670

```ts
importCardTransactions: (rows: Omit<CardTransaction, 'id'>[]) => void
```

Consumers: src/screens/app/travel/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## autoMatchCards

Source: src/lib/workspace.tsx:671

```ts
autoMatchCards: () => number
```

Consumers: src/screens/app/travel/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## createReimbursementRun

Source: src/lib/workspace.tsx:672

```ts
createReimbursementRun: (reportIds: string[]) => void
```

Consumers: src/screens/app/travel/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## advanceReimbursementRun

Source: src/lib/workspace.tsx:673

```ts
advanceReimbursementRun: (id: string) => void
```

Consumers: src/screens/app/travel/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateTeSettings

Source: src/lib/workspace.tsx:674

```ts
updateTeSettings: (patch: Partial<TeSettings>) => void
```

Consumers: src/screens/app/travel/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addTicket

Source: src/lib/workspace.tsx:675

```ts
addTicket: (ticket: Omit<Ticket, 'id' | 'reference' | 'createdAt' | 'slaBreached' | 'csat'>) => void
```

Consumers: src/screens/app/support/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateTicket

Source: src/lib/workspace.tsx:676

```ts
updateTicket: (id: string, patch: Partial<Ticket>) => void
```

Consumers: src/screens/app/support/panes.tsx, src/screens/app/support/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addKbArticle

Source: src/lib/workspace.tsx:677

```ts
addKbArticle: (article: Omit<KbArticle, 'id' | 'updatedAt'>) => void
```

Consumers: src/screens/app/support/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeKbArticle

Source: src/lib/workspace.tsx:678

```ts
removeKbArticle: (id: string) => void
```

Consumers: src/screens/app/support/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addKbCategory

Source: src/lib/workspace.tsx:679

```ts
addKbCategory: (name: string) => void
```

Consumers: src/screens/app/support/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addCannedResponse

Source: src/lib/workspace.tsx:680

```ts
addCannedResponse: (response: Omit<CannedResponse, 'id'>) => void
```

Consumers: src/screens/app/support/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeCannedResponse

Source: src/lib/workspace.tsx:681

```ts
removeCannedResponse: (id: string) => void
```

Consumers: src/screens/app/support/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateSupportSettings

Source: src/lib/workspace.tsx:682

```ts
updateSupportSettings: (patch: Partial<SupportSettings>) => void
```

Consumers: src/screens/app/support/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addAsset

Source: src/lib/workspace.tsx:683

```ts
addAsset: (asset: Omit<Asset, 'id' | 'tagNo' | 'acquiredAt'>) => void
```

Consumers: src/screens/app/assets/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateAsset

Source: src/lib/workspace.tsx:684

```ts
updateAsset: (id: string, patch: Partial<Asset>) => void
```

Consumers: src/screens/app/assets/panes.tsx, src/screens/app/assets/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeAsset

Source: src/lib/workspace.tsx:685

```ts
removeAsset: (id: string) => void
```

Consumers: src/screens/app/assets/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addAssetRequest

Source: src/lib/workspace.tsx:686

```ts
addAssetRequest: (request: Omit<AssetRequest, 'id' | 'reference' | 'createdAt' | 'approvedBy'>) => void
```

Consumers: src/screens/app/assets/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## decideAssetRequest

Source: src/lib/workspace.tsx:687

```ts
decideAssetRequest: (id: string, status: string, approver: string) => void
```

Consumers: src/screens/app/assets/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateAssetSettings

Source: src/lib/workspace.tsx:688

```ts
updateAssetSettings: (patch: Partial<AssetSettings>) => void
```

Consumers: src/screens/app/assets/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## resetAssetSettings

Source: src/lib/workspace.tsx:689

```ts
resetAssetSettings: () => void
```

Consumers: src/screens/app/assets/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addRfp

Source: src/lib/workspace.tsx:690

```ts
addRfp: (rfp: Omit<Rfp, 'id' | 'createdAt'>) => void
```

Consumers: src/screens/app/pitch/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateRfp

Source: src/lib/workspace.tsx:691

```ts
updateRfp: (id: string, patch: Partial<Rfp>) => void
```

Consumers: 

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addKbDoc

Source: src/lib/workspace.tsx:692

```ts
addKbDoc: (doc: Omit<KbDoc, 'id' | 'addedAt'>) => void
```

Consumers: src/screens/app/pitch/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeKbDoc

Source: src/lib/workspace.tsx:693

```ts
removeKbDoc: (id: string) => void
```

Consumers: src/screens/app/pitch/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addPitchTemplate

Source: src/lib/workspace.tsx:694

```ts
addPitchTemplate: (name: string) => void
```

Consumers: src/screens/app/pitch/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## setDefaultTemplate

Source: src/lib/workspace.tsx:695

```ts
setDefaultTemplate: (id: string) => void
```

Consumers: src/screens/app/pitch/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removePitchTemplate

Source: src/lib/workspace.tsx:696

```ts
removePitchTemplate: (id: string) => void
```

Consumers: src/screens/app/pitch/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateBrandKit

Source: src/lib/workspace.tsx:697

```ts
updateBrandKit: (patch: Partial<BrandKit>) => void
```

Consumers: src/screens/app/pitch/BrandKit.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addCustomSchema

Source: src/lib/workspace.tsx:698

```ts
addCustomSchema: (schema: Omit<CustomSchema, 'id'>) => void
```

Consumers: src/screens/app/pitch/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateCustomSchema

Source: src/lib/workspace.tsx:699

```ts
updateCustomSchema: (id: string, patch: Partial<CustomSchema>) => void
```

Consumers: src/screens/app/pitch/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## loadPitchSample

Source: src/lib/workspace.tsx:700

```ts
loadPitchSample: () => void
```

Consumers: src/screens/app/pitch/BrandKit.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## clearPitchSample

Source: src/lib/workspace.tsx:701

```ts
clearPitchSample: () => void
```

Consumers: src/screens/app/pitch/BrandKit.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addPosCustomer

Source: src/lib/workspace.tsx:702

```ts
addPosCustomer: (customer: Omit<PosCustomer, 'id' | 'createdAt'>) => void
```

Consumers: src/screens/app/pos/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addPosDoc

Source: src/lib/workspace.tsx:703

```ts
addPosDoc: (doc: Omit<PosDoc, 'id' | 'reference' | 'createdAt'>) => void
```

Consumers: src/screens/app/pos/SalesPos.tsx, src/screens/app/pos/panes.tsx, src/screens/app/pos/parts.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updatePosDoc

Source: src/lib/workspace.tsx:704

```ts
updatePosDoc: (id: string, patch: Partial<PosDoc>) => void
```

Consumers: 

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removePosDoc

Source: src/lib/workspace.tsx:705

```ts
removePosDoc: (id: string) => void
```

Consumers: src/screens/app/pos/parts.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## openPosShift

Source: src/lib/workspace.tsx:706

```ts
openPosShift: (shift: Omit<PosShift, 'id' | 'openedAt' | 'cashTaken' | 'cardTaken'>) => void
```

Consumers: src/screens/app/pos/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## closePosShift

Source: src/lib/workspace.tsx:707

```ts
closePosShift: (id: string, countedCash: number) => void
```

Consumers: src/screens/app/pos/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updateMatchSettings

Source: src/lib/workspace.tsx:708

```ts
updateMatchSettings: (patch: Partial<MatchSettings>) => void
```

Consumers: src/screens/app/pos/panes.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## updatePosSettings

Source: src/lib/workspace.tsx:709

```ts
updatePosSettings: (patch: Partial<PosSettings>, summary: string) => void
```

Consumers: src/screens/app/pos/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addAppRecord

Source: src/lib/workspace.tsx:710

```ts
addAppRecord: (key: string, title: string, fields: Record<string, string>) => void
```

Consumers: src/components/RecordDialog.tsx, src/screens/app/crm/records.tsx, src/screens/app/hr/panels.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeAppRecord

Source: src/lib/workspace.tsx:711

```ts
removeAppRecord: (key: string, id: string) => void
```

Consumers: src/screens/app/crm/records.tsx, src/screens/app/hr/panels.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeCustomConnector

Source: src/lib/workspace.tsx:712

```ts
removeCustomConnector: (id: string) => void
```

Consumers: src/screens/app/Integrations.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## toggleSchedule

Source: src/lib/workspace.tsx:713

```ts
toggleSchedule: (id: string) => void
```

Consumers: src/screens/app/ScheduledJobs.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addSchedule

Source: src/lib/workspace.tsx:714

```ts
addSchedule: (schedule: Omit<Schedule, 'id'>) => void
```

Consumers: src/screens/app/AdminScheduledJobs.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## removeSchedule

Source: src/lib/workspace.tsx:715

```ts
removeSchedule: (id: string) => void
```

Consumers: src/screens/app/ScheduledJobs.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## install

Source: src/lib/workspace.tsx:716

```ts
install: (code: string) => void
```

Consumers: src/app/app/[slug]/page.tsx, src/components/AppSidebar.tsx, src/components/CopilotDock.tsx, src/components/PortalLayout.tsx, src/lib/agentCatalog.ts, src/lib/appData.ts, src/lib/appNav.ts, src/lib/landingData.ts, src/lib/pages/info.ts, src/lib/pages/product.ts, src/screens/Landing.tsx, src/screens/Onboarding.tsx, src/screens/PublicMarketplace.tsx, src/screens/app/AdminScheduledJobs.tsx, src/screens/app/AgentPortal.tsx, src/screens/app/AgentStudio.tsx, src/screens/app/GenericPortal.tsx, src/screens/app/Guardrails.tsx, src/screens/app/Marketplace.tsx, src/screens/app/Overview.tsx, src/screens/app/Runners.tsx, src/screens/app/assets/AssetManagement.tsx, src/screens/app/dashboardPanels.tsx, src/screens/app/pitch/PitchPilot.tsx, src/screens/app/pos/SalesPos.tsx, src/screens/app/support/SupportTicketing.tsx, src/screens/app/travel/TravelExpense.tsx, src/screens/app/workspace.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## uninstall

Source: src/lib/workspace.tsx:717

```ts
uninstall: (code: string) => void
```

Consumers: src/screens/app/Marketplace.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## reload

Source: src/lib/workspace.tsx:718

```ts
reload: () => void
```

Consumers: src/screens/Onboarding.tsx, src/screens/app/Approvals.tsx, src/screens/app/pitch/BrandKit.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## toggleAppDisabled

Source: src/lib/workspace.tsx:719

```ts
toggleAppDisabled: (code: string) => void
```

Consumers: src/screens/app/Marketplace.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## spend

Source: src/lib/workspace.tsx:720

```ts
spend: (credits: number) => boolean
```

Consumers: src/components/CopilotDock.tsx, src/components/ProductPreview.tsx, src/lib/landingData.ts, src/lib/pages/product.ts, src/lib/travelExpenseData.ts, src/screens/app/Overview.tsx, src/screens/app/PromptLab.tsx, src/screens/app/VibeStudio.tsx, src/screens/app/assets/settings.tsx, src/screens/app/business/Chat.tsx, src/screens/app/business/Tool.tsx, src/screens/app/pitch/panes.tsx, src/screens/app/pos/settings.tsx, src/screens/app/support/settings.tsx, src/screens/app/travel/panes.tsx, src/screens/app/travel/settings.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## addArtifact

Source: src/lib/workspace.tsx:721

```ts
addArtifact: (input: { name: string; skill: string; kind: string }) => Artifact
```

Consumers: src/screens/app/VibeStudio.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## publishArtifact

Source: src/lib/workspace.tsx:722

```ts
publishArtifact: (id: string) => void
```

Consumers: src/screens/app/VibeStudio.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.

## recordRun

Source: src/lib/workspace.tsx:723

```ts
recordRun: (input: { agent: string; source: string }) => Run
```

Consumers: src/screens/app/AgentPortal.tsx, src/screens/app/AgentStudio.tsx, src/screens/app/GenericPortal.tsx, src/screens/app/ScheduledJobs.tsx, src/screens/studio/AgentStudio.tsx

Status: prototype only; production authorization/validation/persistence/execution unverified.
