> **2026-09-21 audit:** This repository remains a frontend prototype, not a production application. See [the audit and specifications](docs/audit/README.md), [actual verification](docs/audit/VERIFICATION.md), and [the standalone 62-loop implementation prompt](docs/IMPLEMENTATION-PROMPT.md). The historical reconstruction notes below describe appearance/local behavior and must not be interpreted as evidence of real backend/integrations.

# Apragya AI — starting flow

A rebuild of the acquisition-to-activation flow on [apragya.ai](https://apragya.ai):
**landing → sign up → onboarding → workspace**, with sign-in as the returning-user branch.

Stack: Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind 4.

## Design system

Tokens in `src/app/globals.css` are transcribed from apragya.ai's own stylesheet — both the
`:root` light set and the `.dark` set (a warm near-black `19 17 14` ground, cream text, and
a sky-blue accent that replaces the teal used in light). Components reference semantic names
(`bg-surface`, `text-fg-muted`, `border-line`, `text-accent`) rather than raw palette steps,
so the theme swap is a class on `<html>` and nothing else.

**Switching it is a three-way choice — Light, Dark, or System — in three places**, all driven
by `src/lib/theme.tsx`: a labelled **Appearance** setting on Account, the stacked control at
the foot of the marketing rail, and a compact sun/moon pair in the workspace top bar. The
compact one offers only the two themes, and marks whichever is actually painted, so it never
claims a state the page is not in.

`System` keeps following the OS rather than reading it once — the provider subscribes to
`prefers-color-scheme` and drops the subscription the moment a reader picks a side. The
choice is stored per browser, and applied before paint by the boot script, so a dark reader
never sees a white flash on the way in.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # next build
npm start        # serve the production build
```

## Routing

Routes are real App Router segments under `src/app`, mirroring the URLs the live product
uses: the marketing pages at the root, the data-driven product/company/legal pages behind one
`[...slug]` catch-all segment with `generateStaticParams`, and the whole workspace under `/app` sharing a
layout that supplies the rail, the top bar and the copilot dock. `/app/me` nests its own
`PortalLayout`; Pitch Pilot owns its left rail and takes one optional catch-all; any installed
app without a purpose-built surface falls through `/app/[slug]` to the generic portal.

The screens themselves live in `src/screens` and were not rewritten around a different
navigation API. `src/lib/router.tsx` expresses the small surface they were built against —
`<Link to>`, `useLocation()`, a `useSearchParams()` that returns a tuple, `useNavigate()`,
`<Navigate>` — on top of `next/link` and `next/navigation`. Routing is genuinely Next's;
the shim is an adapter, not a second router.

Two consequences worth naming. `useLocation()` deliberately returns the path only, because
reading the query is what forces a route out of static rendering and almost every caller
just wants to know which nav item to light up — the one place that needs the query (the
sidebar, which distinguishes two items sharing a path) asks for it directly. And everything
under `/app` sits inside a single `<Suspense>` boundary: its state lives in the browser and
it reads its own `?tab=`, so there is nothing for the server to prerender, and one boundary
at the top says so instead of thirty pages each repeating it.

Theme is applied before hydration by a small `beforeInteractive` script, so a dark reader
never sees a white flash; React then starts from the same value the server rendered and takes
over on mount. React 19 logs a dev-only warning about any `<script>` in the tree — the
alternative is reading a cookie in the root layout, which would make every marketing page
dynamically rendered, and that is a worse trade than a console line in development.

## Product UI

The signed-in app follows Apragya's own visual language rather than a generic admin theme.

- **Line icons, not emoji.** `src/components/Icon.tsx` holds the stroked 24px set the live
  product draws with, as inline SVG in `currentColor` — no icon package, no network request,
  and every icon inherits the size and colour of the text beside it. The sidebar, page
  headings, tab strips and empty states all use it, and installed apps map to it by app code.
- **Panels lift off the ground.** One rule in `src/app/globals.css` gives every `rounded-2xl`
  surface a hairline shadow, so cards read as panels without a drop-shadow look.
- **Tables read as tables.** Inside `.app-surface`, headers take a tinted ground, rows
  highlight on hover, and inputs share a single focus ring instead of four near-identical
  ones.
- **A density step down.** The live screenshots were taken on a very wide display, so type
  that matches them there reads oversized on a laptop. One block in `src/app/globals.css` steps
  the product's type scale and panel padding down together, keeping the ratios rather than
  re-guessing a number in thirty components. It covers **both** size families — the arbitrary
  values most of the app uses and Tailwind's named steps, which a few headings reach for; the
  first pass missed the named ones, which is why the workspace greeting stayed large while
  everything under it shrank. Anything at 9px or below keeps its size: that text is a label,
  not something anyone reads a sentence of. The marketing pages keep their own sizes.
- **Colour where it carries meaning.** Categorical chips — tool categories, connector auth
  types, data-inventory categories, compliance metrics — take one of six hues instead of six
  shades of grey, with `toneFor()` in `src/lib/tones.ts` keeping a given category on the same
  colour. Both themes are defined explicitly, since the app's dark mode is a class rather
  than a media query.
- **Motion that reports state, not decoration.** The content area animates in on every
  navigation (keyed on the path), table rows stagger in behind it for the first twelve rows
  only — past that it reads as lag — dialogs rise into a fading overlay, cards lift on hover,
  buttons compress on press, and sidebar items ease their indent. Every one of these is
  switched off under `prefers-reduced-motion`.
- **One button, two contexts.** The primary button keeps its teal→emerald wash on the
  marketing pages and renders flat teal inside the product, matching the live UI, without
  forking the component.

## Marketing design

The public pages carry a deliberate design pass that the signed-in app does not — a visitor
decides there, while the app stays a faithful match to Apragya's product.

- **Hero** — a two-column layout with `ProductPreview`, a scaled rendering of the workspace
  built in markup rather than a screenshot, so it stays theme-aware and sharp at any size.
  Alongside it: an outcome-led headline, the prompt that carries intent into signup, and a
  stats row.
- **Social proof** and an **Outcomes** section — concrete numbers and a quote, since "we have
  AI" persuades nobody on its own.
- **Pricing** — the recommended plan is physically dominant (raised, glowing, larger padding,
  a ribbon), annual shows its saving, and each paid card repeats the risk reversal.
- **Final CTA** — two paths (self-serve and sales) plus the three objections worth answering.
- **Motion** — `Reveal` fades sections in on scroll via IntersectionObserver; `lift`, `glow`,
  `edge` and `mesh` utilities in `src/app/globals.css` add depth. All of it is disabled under
  `prefers-reduced-motion`, and the observer falls back to visible when unsupported.

## Marketing routes

Every public page renders through one spec + one renderer: `src/lib/pages/*` describes each
page as data (hero, sections, final CTA) and `src/screens/ProductPage.tsx` draws it. Adding a
page is a data entry, not a component.

- **Platform** — `/vibe-studio`, `/agent-studio`, `/business-suite`, `/enterprise-apps`,
  `/prompt-lab`, `/integrations`, `/trust`, `/marketplace` (its own page, with filter + search)
- **Vibe Studio skills** — nine sub-pages under `/vibe-studio/…` (web-app-builder,
  mobile-app-builder, web-rpa, business-solution-agents, chat-with-docs, document-builder,
  spreadsheet-builder, presentation-builder, website-builder), generated from one table
- **Company** — `/about`, `/partners`, `/docs`, `/blog`, `/help-center`, `/contact-sales`,
  `/contact-support`, `/free`, `/solutions`, `/compare`
- **Legal** — `/legal/privacy`, `/legal/terms`, `/legal/cookies`

The landing page carries all fifteen sections the live site has, including the interactive
pipeline builder (five industry pipelines), the Agent Studio capability switcher, the
monthly/annual pricing toggle, and the four-group FAQ.

## Auth routes

| Route | Screen | Guard |
| --- | --- | --- |
| `/` | Landing — hero prompt bar, suggestion chips, industry marquee, three suites, apps grid, CTA | public |
| `/register` | Split marketing/form signup with SSO, live password rules, honeypot | public |
| `/login` | Split sign-in with SSO | public |
| `/onboarding` | 3-step wizard — workspace + team size → industry → apps | requires session |
| `/app` | Workspace shell (where the product proper begins) | requires session **and** completed onboarding |

Unknown paths redirect to `/`.

## How the flow hangs together

- The hero prompt bar is the top of the funnel. Whatever the visitor types (or the chip
  they click) is carried as `?intent=` through `/register` into `/onboarding`, so the
  first thing they asked for is still on screen when the workspace opens.
- `src/lib/auth.tsx` is the only place that knows how a session is created or stored.
  It fakes latency and persists to `localStorage`; swapping in real tenant endpoints
  means rewriting `signUp` / `signIn` / `completeOnboarding` and nothing else.
- `src/routes/Protected.tsx` holds both gates. `requireOnboarding` is what keeps a fresh
  tenant from landing in an unconfigured workspace.
- `src/lib/validation.ts` mirrors the field rules the live register form enforces
  (letters-and-spaces names, alphanumeric org names, the five password rules). Validation
  runs on submit, then the password meter updates live.
- `src/lib/content.ts` holds the copy and catalogue data, so the marketing surface can be
  edited without touching components.

## Signed-in product flow

Rebuilt from screenshots of the live app. `/app` is a three-region shell:

**Left sidebar** — brand block with the `Trial · 13d` badge, a collapse toggle, then the
same four groups the product uses: **My Workspace** (Overview, My Stuff, Marketplace,
Inbox), **Apps › Enterprise Apps** (whatever is installed), **Build** (Vibe Studio, Agent
Studio, Business Suite), **Run & Review** (Agent Portal, Approvals, Prompt Lab, Scheduled Jobs), and
a user footer showing name and role.

**Content** — theme toggle and a notification bell whose badge counts open checklist items,
plus the floating AI Copilot.

The sidebar's full group set: **My Workspace**, **Apps › Enterprise Apps**, **Build**,
**Run & Review** (Agent Portal, Approvals, Prompt Lab, Scheduled Jobs), **AI Tools** (Chat,
Writing, Image Gen, Code, All Tools — shortcuts into the Business Suite at `/app/business`), **Analyze** (Audit Trail), and **Administer**.

**Portals** — apps open into a three-pane layout: sidebar → app nav column → content.
`/app/me` (My Workspace self-service), `/app/crm`, and `/app/hr` each carry their full
sub-navigation, every item routed.

### The Overview dashboard

Three stacked cards, as the live app has them: the amber **two-factor nudge** (Turn on now /
Remind me later), the **Trial card** (days left, `AI Credits 0 / 1,000`, `Apps n / 5 + 2
included`, Manage plan), and **Get the most out of Apragya** — the five-task checklist with
its progress bar.

Below the checklist sit the **context tabs** — Overview / CRM / HR & People Ops — which swap
the dashboard panel beneath them rather than navigating. (They are part of the dashboard, not
the shell: other surfaces have no tab bar.) The Overview panel carries the runs-range filter
(This month / 30 days / Today / All time + a date range), six KPI cards, the Plan & Billing /
Members / Org AI Credits Pool meters, Recent Executions, Quick Actions, Your builders,
Workspace activity, AI Credits this month, the AI Tools quick-access strip, four jump cards,
and the Execution Status Breakdown. Each app tab shows that app's own metrics with a
Today / MTD / QTD / YTD period toggle.

The checklist's own promise is *"tasks tick off automatically as you go"*, so it is derived
rather than stored: "Install an enterprise app" is done when `installed` is non-empty,
"Create your first agent" when an artifact exists, "Try the AI Copilot" when the dock has
been used. Only the two tasks with no observable side effect (allocate credits, invite a
teammate) set a flag directly. Ticking a task also decrements the bell badge, because both
read the same derivation.

One credit pool still funds everything — suite tools, agent runs, Vibe builds, Prompt Lab
comparisons, Copilot questions — through a single `spend()` in `src/lib/workspace.tsx`.

### Marketplace

`/app/marketplace` is transcribed from the live catalogue: header with search, sort and a
grid/list toggle, then five category tabs — **Enterprise Apps (15)**, **Web Apps (2)**,
**Mobile Apps (1)**, **Agents (0)**, **Enterprise Agents (60)**.

Each app card carries its kind badge (Data App / Hybrid / AI-Native), category, truncated
description, install count, Featured ribbon, and the right control for its state:
**Install**, **Upgrade** (apps above the current plan), or **Disable + Uninstall** once
installed. The Agents tab shows the live product's own empty state.

The 60 Enterprise Agents live in `src/lib/agentCatalog.ts`, grouped by the app that bundles
them (Support & Ticketing 9, IDP 9, Project Management 7, Travel & Expense 5, CRM 4, HR 4,
then 3 each for Finance, Inventory, Purchase & Payables, Payroll, Manufacturing, Contracts
and Asset Management, and 1 for Sales & POS). Two are marked `custom` and render the
"Custom · Agent Studio" badge, as on the live site.

That catalogue is the single source of truth: `marketApps[].agents` is derived from it, so an
app's bundled-agent count on the dashboard can never drift from what the marketplace lists.
Search filters apps and agents alike, across name, description, category and kind.

Installing any app adds it to the sidebar. CRM and HR open their bespoke portals; every other
app opens `GenericPortal`, which lists its bundled agents with a Run control — so no sidebar
entry dead-ends on an unbuilt route.

### Inbox

`/app/inbox` matches the live surface: three counters (Pending Approvals / Unread
Notifications / Total Today), a **Pending Approvals** card linking to the approvals queue —
with the product's own "Nothing waiting on you right now. ✨" empty state — and a
**Notifications & @Mentions** feed with relative timestamps and unread rows tinted.

The notifications are real events, not fixtures. Installing an app raises one through
`notify()` in `src/lib/workspace.tsx`, with the same wording the live product uses
("… has been installed successfully. You can access it from the Enterprise sidebar."), so the
feed reflects what actually happened in the tenant. The header bell counts unread
notifications, and clicking a row (or "Mark all read") clears it — the one small extension
here, since the live screenshot shows no read affordance.

### CRM app

`/app/crm` is a full enterprise app, not a side-column portal — matched from screenshots:

- **App header** — icon, name, tagline, `v1.0.0`, and the `Trial · 14 days left` pill
- **Ten tabs** — Dashboard, Leads, Contacts, Companies, Deals, Calendar, Follow-ups,
  Sequences, Reports, Settings — with the active one in `?tab=`, so any view is linkable
  (the live app uses the same query-param scheme, including `?tab=activities` for Follow-ups)
- **Dashboard** — accent-topped greeting card with New deal / New lead / New task, four KPI
  cards (Pipeline Value filled accent), Pipeline flow across the nine non-Lost stages, and
  Recent activity
- **Deals** — a kanban board across the pipeline stages, plus a Table view
- **Calendar** — a real month grid with prev/Today/next and today highlighted
- **Reports** — six KPIs, Pipeline Funnel with Total/Weighted, Deals by Source, Deal Status
  Breakdown, Lost Reasons, Sales Velocity with average-time-in-stage, and an Activity
  Leaderboard with its 7d/30d/90d/1y/This month range
- **Settings** — searchable nav over seven groups (Pipeline & Data 7, People & Work 6,
  Inbound 4, Outbound 11, Channels 4, Automation 6, Branding 1) and the default Sales
  Pipeline with each stage's win probability (New 5% → Won 100%, Lost 0%)

**Each rail icon has its own hue.** Twenty identical grey glyphs are a wall to scan, so every
destination takes a stable colour — and an installed app takes the colour of its marketplace
tile, so the hue you clicked Install on is the hue you navigate back to. They are `.nav-*`
classes in `index.css` with a value per theme, since dark mode here is a class rather than a
media query. The active item still overrides to the accent, so "where am I" never competes
with "what is this".

The workspace sidebar is **permanent** — entering an app no longer collapses it, so the
same navigation is one click away from every surface. It is narrow enough (208px) to pay
for itself, and the chevron under the logo still collapses it to a 60px icon rail when an
app wants the width.

### Vibe Studio

`/app/build/vibe-studio` is matched from the live builder: its own top nav (Progress, My
Playbooks, Settings) and runtime selectors — AIU balance, key source, and model
(`Default · claude-sonnet-4-6`) — above a centred hero, "Describe it. **Vibe Studio builds
it.**", the guidance line for people who don't know where to start, and the prompt card with
its model chip.

Below it, **Start from a capability** — Agent, Business Solution Agents, Web app, ERP Custom
Agents, Mobile App, Web RPA Bot — each with the live copy, under the note that each opens its
own workspace. Picking a capability or submitting the prompt runs the build simulation:
staged progress, then a versioned artifact you can publish. That build flow is this rebuild's
own, since the live product navigates into a per-capability workspace.

### Prompt Lab

`/app/prompt-lab` is the playground the live product calls `/playground`: a toolbar carrying
the model, a temperature slider, a max-tokens field, **Templates** and **Run**, over a
**System prompt** and a **User prompt** in monospace, with the tip about `{{variable}}`
placeholders. The right pane is **Response**, empty until you run — "Enter a prompt and click
Run".

Two things it does beyond rendering: it **detects the variables** in your prompts and lists
them under the tip, and Templates loads a saved prompt into both fields. Running debits the
shared credit pool like any other model call, and the response header reports model, latency,
tokens and credits.

## Finish

The structure was right; what it lacked was a reason to linger. The polish layer lives at the
foot of `src/app/globals.css` and is decoration only — every rule below is switched off under
`prefers-reduced-motion`, and none of it moves a layout.

**Marketing.** An **aurora** of three slow, offset blooms drifts behind the hero, animating
only `transform` and `opacity` so it stays on the compositor. The headline arrives **word by
word** — per word, not per letter, because letter-by-letter reads as a gimmick at display
sizes. Cards carry a **spotlight** that tracks the pointer across them, primary buttons take a
**shine** that sweeps once on hover, nav links grow their underline from the left, and a
hairline **read-progress bar** rides the top of the page. The hero's product mock **tilts a
few degrees towards the cursor**, and its onboarding checklist **ticks itself off and starts
over** — a still screenshot says the product exists; a checklist finishing says what using it
is like.

One listener serves all of it. `src/components/Pointer.tsx` reads the single element under the
pointer once per frame and writes `--mx` / `--my` onto it, so a grid of thirty cards costs one
rAF rather than thirty handlers each reading layout.

**Workspace.** Deliberately a quieter register, because it is somewhere people work: panels
rise and take an accent hairline on hover, rail rows shift a hair towards their label, icons
lean in when you reach for them, and KPI panels stagger in behind the page transition. The
hover rule carries a `:has()` guard so only the innermost panel under the pointer lights up —
nesting a card inside a card does not light both.

## Numbers count up

Every headline figure animates to its value the first time it is on screen — the landing
page's `12 hrs`, `~40 sec` and `1 bill`, the hero's `15+ / 50+ / 60s`, each solution's
stats, the pricing, and the KPI cards inside the app.

`<CountUp value="…" />` parses the first number out of the string it is given, so a stat
stays one readable literal at the call site and keeps whatever surrounds it: the `~` on
`~40 sec`, the `₹` and thousands separator on `₹3,333`, the unit on `12 hrs`. A value with
no number in it — `Custom`, `Same day`, `3-way` — renders as written, and so does every
value for a reader who prefers reduced motion. Digits are tabular so the line does not
jitter as they change width.

Three details worth stating, because each was a bug first. It starts on two triggers, not
one: a figure already on screen counts immediately, and only a figure below the fold waits
for the observer — relying on the observer alone left numbers stuck at zero wherever the
initial observation is never delivered. It re-counts when its value changes under the
reader, which is what the monthly/annual pricing switch does. And a hidden tab gets no
animation frames, so a count started there would sit at zero until the reader came back:
there it skips the animation and prints the real figure. A price is never allowed to read
zero because an animation did not run.

## Every control does what it says

A button that looks live and does nothing is worse than no button, so the rebuild holds a
rule: **a control either performs what its label promises, or it is visibly disabled with a
title saying why.** Nothing is decorative.

Concretely that meant four kinds of work. Controls with a model behind them were wired to it
— POS's *Run due now* really drafts an invoice per active subscription, Support's *Run
detector* flags every active ticket past its priority's SLA and *Run auto-close* closes
resolved tickets older than the CSAT window, ITAM's *Reset to Default* really resets, and
Approvals' refresh re-reads the persisted workspace so another tab's writes show up. Controls
that were the wrong element became the right one: the fake dropdowns across CRM and HR are
real `<select>`s, and Vibe Studio's spend and key chips are readouts rather than buttons,
because that is what they are. Controls that pointed somewhere got their link — *Upgrade
plan* and the marketplace's *⚡ Upgrade* go to Manage plan; Agent Studio's account and
settings rows reach the workspace; the marketplace's `i` opens the app's detail with its
agents. And the marketplace's *Disable* now disables: an app can be switched off without
being uninstalled, which is what its own tooltip always claimed.

**CRM and HR got a record store.** Those two surfaces were transcribed as layouts with no
schema, so their thirty-odd create buttons had nothing to write to. They now share one:
`appRecords`, keyed per surface, behind a single `RecordDialog`. Where a page ships a
transcribed field spec the dialog uses it; where it doesn't, the button still opens a dialog
named after itself and captures a name, a date and notes — honest about how much was
transcribed without leaving the control dead. Records then list in place of the empty state,
CSV import and export move real rows, and CRM's dashboard counts them: pipeline value, open
deals, win rate and the stage bars are all derived, so a fresh tenant still reads zero.

Three things stay deliberately inert, each saying so on hover: a nested entries list inside a
create dialog (those are added once the record exists), an export with nothing in range, and
the default sales pipeline's stages, which ship with the app — duplicate it to edit the copy.

## Enterprise Apps

### Sales & POS

`/app/sales-pos` is the `POS` app — order-to-cash for retail and B2B in one surface. Like the
live one it drops the tab bar for a **collapsible left rail** of eight groups: Overview,
Customers, Order to invoice (Rate contracts, Quotations, Sales orders, Delivery notes, Sales
invoices), Point of sale (POS till, Shifts), Returns (Sales returns, Credit notes, Refunds),
Receivables & reports (AR aging, Reports), Recurring (Subscriptions) and Admin (Match
settings, Settings) — seventeen sections, each at the live `?tab=` id.

**Sales overview** takes a 7d / 30d / 90d period and reports Invoiced, Average invoice, AR
outstanding and Overdue for that window, then Invoiced revenue as a daily total, the
**Order to cash** funnel (quotations open → orders to fulfil → delivered-not-invoiced →
invoices in draft → invoices posted), **Sales — CY** with its twelve month bars and the
"no fiscal year configured, assuming calendar year" note, Payment due, AR aging, Payment
status and Who owes the most. Every number counts the tenant's own documents; nothing is a
fixture, so a fresh tenant reads zero everywhere and says why.

**Documents share one renderer.** Rate contracts, sales orders, delivery notes, sales
invoices, sales returns, credit notes, refunds and subscriptions differ only in their status
vocabulary and reference prefix, so they are one `DocListPane` driven by data — references
number per kind (`QT-0001`, `SO-0001`, `DN-`, `INV-`, `RMA-`, `CN-`, `RF-`, `RC-`, `SUB-`).
Quotations get the fuller treatment the live app gives them: four KPIs including a win rate
and the nine status chips through Superseded.

**POS till** is the open/close pair. Opening takes a cash float, a till currency (with the
org-default hint and the warning that only products priced in it can be sold) and an optional
warehouse leg; closing counts the drawer and reports the **variance** against expected
takings. **Shifts** is the reconciliation dashboard — cashiers, open shifts, red and amber
flags, net variance, then till takings, cash mix, cash variance, cashier bands, takings by
cashier, live open shifts and the cashier scorecard. The bands are the live thresholds:
red above 5, amber above 1.

**Match settings** is transcribed: the 3-way price and quantity tolerances with their
warn / block / allow actions, and the required-documents toggles that refuse an invoice with
no order or shipment behind it.

**Settings** is its own nested surface, with the copilot banner over a nine-item sub-rail:
Tax categories, Customer groups, Loyalty & tiers, Cash variance tolerance, Custom Fields, AI
Agents, Schedules, Change History, Appearance.

*Tax categories* explains the within-state / inter-state split and seeds the whole GST ladder
in one click — 0 / 5 / 12 / 18 / 28%, each splitting half CGST + half SGST locally and whole
as IGST across a state line, which is also how a hand-made category derives its split.
*Customer groups* offers the same one-click seed for Walk-in / Regulars / Wholesale, on the
argument the live copy makes: a segment picked from a list can't split a report across
"Regulars" and "regulars". *Loyalty & tiers* accrues on net subtotal and spends at the till.

*Cash variance tolerance* is the one pane with real teeth. Its five figures are transcribed
(reason required above 1, amber/red worst shift 1 and 5, amber/red recent average 0.5 and 2)
and **the Shifts dashboard reads them** — change red here and the cashier scorecard recolours,
rather than the two drifting apart. Save stays disabled until something actually changes, and
refuses a red below its amber, because the hints promise that ordering.

*AI Agents* shows credit spend against the real pool and the app's one catalogue agent, Quote
Quality Reviewer, running automatically on create. *Schedules* says what it needs — a workflow
attached to the app — rather than offering a cron box with nothing to fire.

*Change History* is the backbone: **every settings edit records its own one-line entry**, so
"0 change(s) made so far" is a fact about the tenant and not a placeholder, and Reset to
Default is disabled until there is something to reset. Only *Appearance* wasn't screenshotted;
it says so and lists what the app actually renders with instead of inventing controls.

One honest gap left. **Reports** has all ten live sub-tabs (Sales Tracker, Customer Performance,
Cohort Retention, Margin by Category, Daily Sales, Day Sheet / Z-report, Item Sales, Cashier
Performance, Cashflow Forecast, AI Assist), but only **Sales Tracker** computes — it lists
the tenant's own orders. The other nine say they need trade history this rebuild does not
simulate, rather than draw an invented chart.

### Pitch Pilot

`/app/pitch-pilot` is shaped unlike the other Enterprise Apps, because the live one is: no tab
bar, but **its own left rail** — Work (Dashboard, RFP Inbox, New RFP), Library (Knowledge
Base, Templates), Settings (Extraction Schema, Brand Kit), Insights (Analytics) — with real
routes rather than query params, and **its own indigo palette** instead of the workspace
teal. That palette is a `.pitch-pilot` token override in `src/app/globals.css`, the same trick
Agent Studio uses, so the app keeps its identity without forking a single component.

**Dashboard** greets by time of day and prints today's date, the active-RFP count and the
deadline line, over In flight / Your turn / Out for client / Pipeline value — every one
counted from the tenant's own RFPs, with pipeline summing only what is still in the funnel.
The right column carries Win rate (`—` until something is decided), the indigo **Time saved**
card, and AI spend against the monthly budget.

**New RFP** is a real dropzone: drop or browse a PDF, optionally name the prospect, pick one
of the four stock schemas or Auto-detect, and **Extract & Open** creates the RFP — falling
back to the file name when the prospect is blank, which is what the hint promises.
**Knowledge Base** has the six live category chips with counts, **Templates** warns that no
active template is set and makes the first upload the default, and **Extraction Schema**
lists the four stock schemas with their fields (read-only, since they ship with the app)
beside custom ones you can edit.

**Brand Kit** is transcribed: firm identity with a working logo uploader, the navy **cover
preview** that redraws live as you change the palette or firm name, the three-swatch palette
at `#1E3A8A` / `#F59E0B` / `#0F172A`, the contact strip, and the regenerate tip. "All saved"
shows only when nothing is pending.

One deliberate difference: the live tenant shows a **"Sample data loaded"** banner while every
list underneath reads zero — the two contradict each other. Here the banner appears only when
sample data actually is loaded, and Brand Kit carries the load/clear control the banner points
at, so a fresh tenant's empty states and its banner agree.

### Asset Management

`/app/asset-management` is the ITAM app: horizontal tabs for **Dashboard**, **Asset
Register**, **My Asset**, **Requests**, **Reports** and **Settings**, each at the live
`?tab=` value.

**Dashboard** leads with **Active assets** — and it is genuinely active, because retired
units are excluded from the count exactly as the caption promises. The four *Needs attention*
tiles (pending requests, out of warranty, warranty expiring, with leavers) count real
records, each reading "Nothing to do" at zero, over the two panels for expiring warranties
and assets held by leavers.

**Asset Register** carries the type and project selects, the stage chips with their live
counts, Export / Import / Receive from purchase / **+ New asset**, and the eight-column table
with its "No assets yet" empty state. Tags are generated from the taxonomy: creating a laptop
gives `LAP-0001`, because the prefix comes from the asset type's own entry. Export and Import
both work on real CSV.

**Requests** is the `Request → approve → issue` queue, with the All / Mine / Waiting on me
chips, the approver notice, and approve/reject actions that move the record and the dashboard.
**Reports** keeps the six sub-tabs, and Stock summary really groups issued-vs-in-stock by
asset type or project.

**Settings** opens on the Copilot banner and the six-item left column. **Approval Levels** is
the live multi-level ladder — level, type, approver chips, **+ Add level**. **AI Agents**
lists the app's three real agents from the shared catalogue with their trigger descriptions,
the credit-spend bar reporting how many are running, and working pause / auto-run / auto-pause
controls. **Schedules** and **Change History** carry the live empty states, the latter reading
the tenant's own audit trail.

**Master Taxonomies** behaves as it does live: it opens as **its own top-level tab** beside
Settings rather than a pane inside it, with "Back to Settings". Its nine taxonomies are in the
left column with live counts, and the Asset Types table is transcribed — value, label, tag
prefix, and the config flag with its count. The **Value column is read-only**, because the
footnote below it says a saved value is locked once records store it; renaming the Label is
what stays safe.

### Support & Ticketing

`/app/support-ticketing` is laid out differently from Travel & Expense, as the live app is:
a **left rail of collapsible groups** — Overview, Tickets, Knowledge, My requests, SLA,
Automation, Insights, Admin — rather than a horizontal tab bar. Each section sits at the live
`?tab=` value, and the app tile keeps the product's own pink rather than the workspace teal.

**Dashboard** is five KPIs — Total Tickets, Open, Resolved with its percentage, SLA Breached,
Avg CSAT — over By Status / By Priority / By Category. All of it counts the tenant's own
tickets: `Resolved 0 (0%)` and `Avg CSAT N/A` are what an empty helpdesk honestly reports,
and the three breakdowns say "No data" rather than drawing an empty chart frame.

**All tickets** carries the live filter stack: the queue chips (All / My / Unassigned), the
eight status chips, the source select and the tag filter, with search beneath and
**+ Save current filter** above. Tickets expand in place to change status, assign to
yourself, or flag an SLA breach — and every one of those moves the Dashboard. References run
in tenant order (`SUP-0001`), not as opaque ids.

**Articles** is the knowledge base with its natural-language search box, category select and
draft/published/archived chips; **Import CSV** genuinely parses a file into draft articles.
**My requests** and **Canned Responses** are the same shape, each with the live empty state.

**Policies** and **Routing rules** are **not on the trial plan**, and the app says so exactly
as the live one does — the lock card, "… isn't on your plan", and both buttons — instead of
showing an empty list for something the tenant cannot use. `gatedSections` in
`src/lib/supportData.ts` is what decides that, so unlocking a feature is a one-line change.

**Support settings** is its own surface with the live fourteen-tab strip that wraps onto a
second row. **Ticket fields** is transcribed in full across its five sub-tabs — the seven
**Statuses** with their colour dots, slugs and `Active` / `Waiting — SLA paused` /
`Closed state` behaviours; the seven **Categories**; the four **Priorities** with their SLA
hours (4 / 8 / 24 / 72); the five **Types**; the six **Channels** — including the live
button labels, "Add statuse" and "Add categorie" among them.

Those fields are not decoration: **Settings → Ticket fields drives the Tickets surface.** The
status chips, source select, priority and category dropdowns and the dashboard's idea of
"open" all read this configuration, so adding a status or renaming a channel changes the
queue. Which statuses count as open comes from the `behaviour` column rather than a constant.

**Web widget** carries every field, both checkboxes with their hints, the accent-colour
swatch and position, plus the live **Preview** and **Install** cards — and the preview is
wired, so changing the accent or the launcher text redraws it. **CSAT survey** has all six
settings with their explanations and the "What the customer sees" panel. **Tiers & search**
shows the four service tiers resolving to Standard SLA with the "Using the default" warning
and its footnote, over the knowledge-base indexing meter, which reports real published-article
counts. **Report exports** downloads an actual CSV of the tickets in range.

Escalation rules, Inbox accounts, Inbound channels, Business hours, Auto-responses and Shift
handoffs share one list component with their own transcribed copy and empty states — including
the Inbox accounts notice about managed inbound email not being configured. **Parse failures**
and **CSAT review** report honestly rather than inventing rows.

**Support reports** keeps the seven sub-tabs and the range select; SLA Compliance is a real
per-priority table that totals correctly (`0 | 0 | – | 0 | –` when empty). The other six say
what they need rather than rendering a fake chart. 

### Travel & Expense

`/app/travel-expense` is the first Enterprise App rebuilt as its own surface rather than
through the generic portal. The header carries the app tile, name, the live blurb, `v1.0.0`
and the trial pill; under it sit the nine tabs — **Dashboard**, **Expense reports**,
**Cards**, **Reimbursements**, **Travel**, **Agency review**, **Approval inbox**,
**Reports**, **Settings** — each at the live `?tab=` value, so a link into a tab lands there.

Nothing on the Dashboard is a fixture. Approved spend, pending reimbursement, reimbursed,
drafts, awaiting approval, unmatched card charges and travel pending are all counted off the
tenant's own records, the four pipeline buckets are the same reports grouped by status, and
**Avg turnaround is measured** — the gap between a report's creation and its reimbursement,
which is why it reads `–` until something completes rather than showing an invented number.
Spend by category and Monthly trend say "No approved spend yet." / "No data." for the same
reason.

The records move through a real lifecycle. A report goes Draft → Submitted → Approved →
Reimbursed; submitting it makes it appear in the Approval inbox and bumps its PENDING count;
approving it makes it selectable on **Reimbursements**, where batching selected reports into
a run walks the live stage names — Request Processed → Moved to Accounts → Batch Generation →
Disbursed — and disbursing is what actually marks the reports reimbursed, which in turn moves
the dashboard. **Import statement** reads a real CSV and skips duplicate rows as the live
copy promises; **Auto-match** matches charges to reports by amount and reports how many
matched rather than claiming success.

**Settings** is its own surface: the accent "Need a change? Just ask" banner with **Open
Copilot** (which opens the workspace Copilot dock rather than a second one), then the live
left column grouped **Expense / Travel / Reimbursement / General** across all thirteen
sections, each addressable at `?tab=settings&s=…`.

**Expense policy** is transcribed: both explanatory paragraphs, Enforcement, *Receipt
required at/above*, the duplicate-detection checkbox, and the twelve per-category spend
limits in the live grid's own order — general, travel, per diem, per km, hotel, meals,
lodging, transport, office supplies, client entertainment, training, other. Its **Save
policy** button greys out until something actually changes, which is the one deliberate
difference from the live screenshot.

The other sections are built rather than transcribed, and two of them are wired to the rest
of the app rather than being forms that store nothing: **Reimbursement SLA** is the number
the Dashboard's pipeline header prints, so changing it there changes what the app promises
here; **AI Agents** lists this app's own agents from the shared catalogue; **Change History**
and **Schedules** are the app-scoped slices of the tenant's audit trail and schedule list.
**Appearance** says plainly that the app follows the workspace theme and that the live
options were not transcribed, rather than inventing a theme picker.

**Reports** keeps the live left-hand view list and the FROM/TO range with its 30d/90d/180d/
365d shortcuts, defaulting to the last 90 days as the live page does. **Settings** was not
screenshotted, so it lists only what this rebuild actually enforces and says so.

## Administer — Setup

The **ADMINISTER** group carries the live item list, NEW badges and all: Setup, Guardrails,
Runners, Integrations, Scheduled Jobs, Client Portal, Compliance Center. **Setup**,
**Guardrails**, **Runners**, **Integrations**, **Scheduled Jobs**, **Client Portal** and
**Compliance Center** are all built — the group is complete.

`/app/setup` is the configuration index — the heading, its blurb, and the **Companies** card.
`/app/setup/companies` is **Companies & consolidation**, with the live copy and its three
tabs:

- **Companies** — the note that a single-entity tenant needs a second entity before it can
  consolidate, **+ New company**, and the table (Legal entity, Code, Currency, Country,
  Parent, Role, Status) with an edit control per row.
- **Intercompany pairs** — the elimination-account explanation, **+ New pair**, and
  "No intercompany pairs defined."
- **Consolidated TB** — *Roll up under*, *As of (optional)*, the reporting-currency and
  entities-consolidated chips, and the trial balance with its Total row.

The entity list is derived, not fixtured. The **primary company is the organization named at
signup** — name, and a three-letter code from it — so a tenant has exactly one entity before
anyone configures anything, which is why the live page says "Single-entity tenant". Only
entities an admin adds are stored, and edits to the primary are kept as an override so the
derivation still holds. Everything downstream follows from that one list: **+ New pair** is
disabled until a second entity exists, *Roll up under* is the entity list, and *Entities
consolidated* counts what actually rolls up to the selected parent, however deep the chain.
Creating an entity or a pair writes to the audit trail like every other tenant action.

The trial balance totals stay at `0.00`: this rebuild has no general ledger, and the page
says so under the table instead of showing invented balances.

### Compliance Center

`/app/compliance-center` carries the heading, its one-line summary, and the six pill tabs:
**Dashboard**, **DPIA**, **Automated Decisions**, **Data Inventory**, **Data Flows**,
**Connector Retention**.

**Data Inventory** and **Data Flows** are transcribed registers. The inventory is the GDPR
Art. 30 catalogue — entity, field, category, sensitivity, legal basis and retention, from
`agri_farmers.aadhaar_hash` through `users.email` — and the flow map is all nine flows with
their type, source, destination and cross-border safeguard (`SCC`, `SCC + DPA`). The live
inventory table scrolls before its last three rows; those are completed in
`src/lib/complianceData.ts` and marked there, chosen so the totals match what the live
dashboard reports.

That matters because **the Dashboard is entirely derived**. "Sensitive data fields 6 / 16
catalogued" counts the inventory; "Data flows mapped 9 / 3 cross-border" and "Cross-border
flows 3" count the flows; "DPIA needs review" and "Profiling w/o human review" count the
registers. Every figure matches the live dashboard, and each one moves when its register
does rather than being a number typed into a card. The DPA warning shows for the same reason:
no template is published.

The four empty registers show the live empty states — "No DPIAs yet", "No automated decisions
registered", "No connector retention policies set", each over its own column headers with the
`0 results` footer. Their create buttons work: **New DPIA**, **New entry** (which marks an
entry *Needs review* exactly when it profiles with no human in the loop, which is what Art. 22
is about), **Add field** / **Edit** / **Delete** on the inventory, **New flow**, and
**Set policy** against any of the 27 connectors. **Discover PII** reports honestly that it
found nothing beyond what is already catalogued, rather than pretending to scan. The Data
Flows **Map** view groups the same flows by ingress / internal / egress; the live map was not
screenshotted, so that view is this rebuild's own.

### Client Portal

`/app/client-portal` is **Client Portal RBAC** — the heading and its line about changes
applying on the next portal request, the amber key callout pointing at internal RBAC as a
separate surface, and the four pill tabs: **Tabs**, **Roles**, **Users**, **Audit**.

**Roles** carries the live copy, **+ New role**, and "No portal roles defined." until one
exists. **New portal role** is transcribed in full: Name / Description, the tenant-default
checkbox, the Scope box whose helper line changes with the scope, and the permission table —
**all twelve portal tabs** with their internal codes (`deals`, `projects`, `activities`,
`quotes`, `invoices`, `contracts`, `tickets`, `purchase_orders`, `purchase_invoices`, `help`,
`travel_requests`, `travel_invoices`), Read / Comment / Download checkboxes, and each tab's
maskable fields — `value`, `probability`, `total_amount`, `outstanding_amount`, `paid_amount`,
`risk_level` and the rest, with "no maskable fields" where a tab has none. Those field chips
are clickable here, toggling whether the field is masked; the live screenshots do not show
what they do, so the interaction is this rebuild's own. Creating a role logs it, and marking
one default clears the flag on any other, since only one default can exist.

**Users** matches the live pane exactly, empty state included — portal users are invited from
a Contact's detail page, which this rebuild does not have, so the pane is honestly empty.
**Audit** is not screenshotted; it shows the portal-scoped slice of the tenant's own audit
trail rather than a second log.

**Tabs** shows the live heading, the summary line ("All tabs enabled - partner users see the
full portal."), the "Overview + login pages stay always-on." warning and **Save changes**,
disabled until something changes. The live card shows no per-tab controls, so the checkbox
grid between summary and footer is mine — without it there would be nothing for Save to save.
The summary is derived from the grid, so turning a tab off rewrites it.

### Integrations

`/app/integrations` carries the live page's three cards. **Your connections** with its
`N total` chip and the plug empty state ("No connections yet" / the Add connection line);
**Available connectors**, a two-column grid of all **27 connectors transcribed from the live
catalogue** — every name, `basic` / `oauth2` / `api_key` / `none` chip and description, in the
order the page lists them, from Email (SMTP) through Meta (Facebook & Instagram); and
**Custom Connectors** with **Import OpenAPI**, **+ New connector** and its own empty state.
One connector card ends mid-sentence in the live UI (ESSL Etimetracklite); the tail is
completed here, and `src/lib/connectorData.ts` marks the spot.

The actions do what they say. Clicking a connector card, or **+ Add connection**, opens the
connection dialog preset to that connector; **OAuth Apps** lists the seven OAuth 2.0
connectors and states plainly that no client is registered, because this rebuild holds none.
**New connector** registers a REST API by hand, and **Import OpenAPI** genuinely parses a
pasted OpenAPI 3 document — it reads `info.title`, the first server URL and the real
operation count off `paths`, and rejects anything that isn't a valid spec with a reason.

One deliberate rule: **secrets are never persisted.** The connection dialog takes an API key
or password where the connector needs one, keeps only the last four characters so the row
stays recognisable, and says so under the field. OAuth connectors save unauthorised, with the
dialog explaining that the real handshake happens in the provider's consent screen.

### Runners

`/app/runners` is **Tenant Runners** — the heading, the live explanation of why a runner
exists (it dials out, so no inbound firewall rule is needed), **+ Pair new runner**, and the
dashed empty panel reading "No runners yet. Click *Pair new runner* to get started."

**Pair new runner** opens the live dialog: Name (`corp-network-prod`), Description (optional)
(`Runs in our datacenter VPC, reaches SAP Gateway`), Cancel, and a **Generate pairing token**
button that stays disabled until the runner has a name.

What happens after that button is this rebuild's own, since the live product's next step was
not screenshotted: the dialog issues a one-time pairing token and the install command that
consumes it, each with a copy control, and the runner appears in the list as **Pending
pairing** — which is the honest status, because nothing has called home. Pairing and removing
a runner both write to the audit trail.

### Guardrails

`/app/guardrails` opens on the shield, the live blurb, and the **Policies** / **Violations**
pill tabs.

**Policies** is the `N policies` counter, **+ Create Policy**, and the table — Policy, Type,
Action, Check Point, Scope, Status, Actions — with the type chip, the colour-coded action
chip (`warn` amber, `block` red, `redact` accent), the `⏻ Active` pill, and edit and delete
controls. All of them work: Create and the pencil open the same form (name, one of six types,
one of four actions, check point, and a scope that lists Global plus the tenant's installed
apps), the status pill toggles the policy, the bin deletes it, and each of those writes
`policy.created` / `policy.updated` / `policy.deleted` to the audit trail.

The live table is 22 identical rows of `E2E Keyword Block` — test residue from Apragya's own
end-to-end suite. Copying that would have been copying their test data, so a tenant here
starts with the five policies **the rest of this app already refers to**: the two the paused
approvals name by hand (`Approval cap — ₹50,000`, `Content filter — legal text`), the one the
sample trace checks (`Max tool calls 8/12`), plus PII redaction and a keyword block. The
approvals queue and the Guardrails table now describe the same tenant.

**Violations** is the Run ID field, **View Violations** (disabled until you type), and the
empty state — "Enter a Run ID to view guardrail violations." over its explanation. Entering
an ID actually looks it up in the tenant's run history: an unknown ID says so, and a real one
reports that no violations were logged along with the guardrail checks that ran and passed.

### Audit Trail

`/app/governance?tab=audit` is the **Analyze** group's one item, at the live URL and with the
live copy: the shield, **Audit Trail**, and "Tenant-scoped audit history for actions taken in
your organization." Then the filter row — **All Actions**, **All Resources**, **All Status**,
a date range, **Export CSV**, **Export JSON**, and "Auto-refreshes every 30s" on the right —
over a search field and the range picker, then the eight-column table (Timestamp, User, Role,
Action, Status, Resource, Resource ID, IP) and the `Showing 1–3 of 3` / `Rows 25` / `Page 1
of 1` footer.

Every control works. The five sortable headers sort and reverse, the Action and Resource
dropdowns are **built from the rows themselves** rather than a fixed list, search matches
user, action, resource and resource id, the range filters against the clock, and the two
export buttons write the filtered rows — not the page — to a CSV or JSON file. The 30-second
refresh is a real interval, so the claim in the header is true.

The rows are the tenant's own history, not fixtures. A fresh workspace starts with the three
entries the live tenant has — `org.created` against the tenant and two `trial.started`
against the subscription — and everything the app does afterwards appends: installing or
removing an app, running an agent, deciding an approval. Only the signed-in user's identity
stays out of storage: a row records `user: 'owner'` and the table resolves it to the session
email, so the tenant's email lives in one place.

`Runs` has left the sidebar, since the live **Analyze** group holds Audit Trail alone.
`/app/runs` is still routed and still linked from the dashboard's execution panels.

### AI Tools — the Business Suite

The sidebar's **AI Tools** group is a set of shortcuts into one surface, exactly as the live
product has it: **Chat** → `/app/business/chat`, **Writing** / **Image Gen** / **Code** →
`/app/business?category=…`, **All Tools** → `/app/business`.

`/app/business` opens on the mint banner — "Welcome back, *name*" over the 100+ tools line —
then **Quick access** (AI chat, Image generator, Code assistant), **Featured tools** with
*View all*, and **Browse by category**. A category page (`?category=writing`) keeps the same
banner shape: icon, category name, **"N tools available"**, then a three-column grid of tool
cards, each with its `~N AI Credits` chip.

The catalogue lives in `src/lib/businessData.ts`. **Writing (12)**, **Creative (8)** and
**Development (11)** are transcribed tool-for-tool from the live pages — same names, same
blurbs, same costs, down to Git Commit Message Writer costing `~0`. The other seven
categories are patterned on them to reach the 102 tools the "100+" claim needs; that copy is
this rebuild's own. Nothing is duplicated between the lists that feed the page: Featured
tools names six tools and looks their cost and blurb up in the catalogue, so a price only
ever changes in one place, and the category counter is `tools.length` rather than a number
to keep in sync.

Clicking any tool opens `/app/business/tool/<slug>` — one prompt-and-run shell shared by all
of them, since the live per-tool forms have not been transcribed. Running debits that tool's
cost from the same pool as everything else.

**AI chat** (`/app/business/chat`) matches the live `/business/chat`: Back, the chat tile,
**AI chat** over its live message count, then the model select (Claude Sonnet 4.6 and four
others), a **System** disclosure that opens a system-prompt box, and **+ New Chat**. Empty,
it shows "Start a conversation" / "Chat with AI. Ask questions, write content, analyze data,
and more." over the six starter prompts, all of which send. The composer sends on Enter and
breaks the line on Shift+Enter, as its own placeholder promises, and each turn costs one
credit.

### Scheduled Jobs

Scheduled Jobs is in the sidebar **twice**, as it is in the live product, and the two views
differ. `/app/scheduled-jobs` under **Run & Review** can only watch and pause;
`/app/admin/scheduled-jobs` under **Administer** adds the **My Schedules** tab and
**+ New Automation**, under its own heading ("Your organisation's scheduled jobs — agent
runs, workflows, bots and app automations. Pause, resume or re-time anything."). Both render
the same card from the same tenant state, so a schedule created in one appears in the other.

**New Automation** is the live dialog: **Target app** (the tenant's installed apps, starting
at "Select an app..."), **What to run** (disabled and reading "Pick an app first" until an app
is chosen, then that app's own agents), **Name**, and a **Schedule** pair of cadence and
time. Under the pickers sits the line the live dialog shows — `Every day at 02:00 · UTC ·
0 2 * * *` — and it is computed, not fixed: switching to Weekly rewrites both halves to
`Every Monday at 02:00 · UTC · 0 2 * * 1`. Creating compiles the same rule into the schedule's
next run.

`/app/scheduled-jobs` matches the live `/schedules`: the title over "Agents, workflows, and
bots that run on a timer in your workspace. Pause anything you want to stop.", then a single
card whose toolbar carries the **`N active · N total`** counter, a **Search name, target,
tenant...** field, an **All types** select (Agent, Pipeline, Bot, Canvas Workflow) and an
**All status** select (Active, Paused).

A fresh tenant schedules nothing, so the card reads "No scheduled jobs. Nothing is running on
a timer." exactly as the live one does — the live page has no create button, and neither does
this. Schedules live in tenant state, so once any exist the rows render with Run now and
Pause/Resume, the counter tracks them, and the search and both selects filter them; filtering
everything out says so rather than claiming the tenant has no schedules.

### Approvals

`/app/approvals` is a **two-pane queue and detail**, matching the live HITL surface: a left
column with **Awaiting review**, **Recently reviewed**, and a **Stats** block (Total Reviews,
Approved, Modified, Rejected in their own colours), beside a detail pane whose empty state
reads "Select a review from the queue".

Selecting a paused run shows why the guardrail stopped it, the summary, and the **extracted
data** the HITL node captured — with the values that tripped the rule flagged — then Approve,
Modify and Reject.

A decision is real state: the item moves from awaiting to reviewed, the stats update, a
notification is raised, and the detail pane explains that the run resumed and the decision is
in the audit trail. Because the queue is derived, the **Inbox** and the **dashboard's Pending
reviews** count fall in step automatically — approving one drops all three from 2 to 1.

### Agent Portal

`/app/agent-portal` lists every agent the tenant can run: a search across business cases,
agents, workflows and automations, seven filters (All · Business Solution Agents · Agents ·
Enterprise Agents · Workflows · Automations · Recent Runs), and a `60 Enterprise agents`
counter derived from the catalogue rather than typed.

Agents are grouped by the app that bundles them — Support & Ticketing 9, IDP 9, Project
Management 7, Travel & Expense 5, CRM 4, HR 4, then three each and Sales & POS 1 — each with
its letter avatar.

The card footer **changes with tenant state**, as the live app's does: an agent whose app is
installed shows its run count and a Run control, while an uninstalled one reads "Ships with
*App* — install the app to run it". Running an agent increments that count and appears under
Recent Runs, which reads real history rather than a fixed empty state.

### Agent Studio

Agent Studio is a **separate product**, not a page in the workspace — on the live platform it
runs on its own subdomain (`agent-studio.apragya.ai/workspace/<id>/home`) with its own dark
chrome. Here it gets its own top-level route, `/studio` (and `/studio/workspace/:id/home`),
rendered **outside** `AppShell`, and its own palette: a cool navy scoped by the
`.agent-studio` class in `src/app/globals.css`, so it keeps that identity whichever theme the main
app is in.

The home screen: its own sidebar (user switcher, Build, Search, then Workspace → Library
[Agents · 1, Activity], Data [Knowledge, Tables, Files], Operations [Schedules, Logs], and
Settings pinned at the foot), a top bar with global search, and "What should we get done,
*Name*?" over the prompt box with its attach controls and model label.

Below: **Start from a template** — seven categories (Popular 6, Sales & CRM 12, Support 8,
Engineering 11, Marketing & Content 10, Productivity 19, Operations 16) beside the selected
category's workflows; clicking one prefills the prompt. Then **Agent Health** (runs passing,
active agents, successful runs, average latency — computed from real run history), a month
calendar, and **Recent Activity**.

The category list and the Popular workflows are transcribed; the workflows inside the other
six categories are patterned, since only Popular was expanded in view.

### HR & People Ops app

`/app/hr` is a full app too, but a **different shape from CRM** — the live product navigates
it through a grouped side column, not a horizontal tab bar. Six groups, 23 pages:

- **Overview** — Dashboard
- **People** — Recruitment, Offers & letters, Onboarding, Employees, Lifecycle changes,
  Documents, Separation
- **Time & Attendance** — Shifts, Attendance, Attendance calendar, Attendance admin, Leaves,
  Team approvals, Overtime, Overtime report, Timesheets
- **Development** — Performance, Training, Skills
- **Care** — Employee care, Announcements
- **Admin** — Settings

Pages do **not** share one layout — each composes its own toolbar, so the shape is described
per page in `src/lib/hrData.ts` rather than assumed:

| Page | Shape |
| --- | --- |
| Recruitment | 5 sub-tabs (Openings…Staffing plans), status filter, New opening |
| Offers & letters | 3 sub-tabs (Offers / Letters / Letter templates), status filter, New offer |
| Onboarding | Runs / Templates, **four stat cards** (Pending, In progress, Completed, Overdue), status filter, New onboarding |
| Employees | **No sub-tabs** — three header actions (Invite pending, Bulk hire CSV, Add employee), search, four filter selects, a Joined date range, and a list/grid toggle |
| Lifecycle changes | Icon sub-tabs (📈 Promotions / 👥 Transfers), status filter, a **full-width employee select**, New promotion beneath it |
| Documents | No sub-tabs — Add document in the header, employee filter with a row count |

Each sub-tab carries its own empty state, so switching Promotions → Transfers changes the
message to "No transfers yet." Groups collapse, and the page lives in `?tab=` exactly as the
live app does — including its underscored slugs (`?tab=lifecycle_changes`).

**Time & Attendance** adds more shapes again:

| Page | Shape |
| --- | --- |
| Shifts | Titled **"Shifts & Rosters"** (the nav label differs from the page title), **underlined** tabs with icons — Definitions / Assignments — and New shift in the header |
| Attendance calendar | No title — a note, an employee select, and a full **Monday-first month grid** with the ten-status legend (Present…Weekend), weekend chips, today highlighted, and month/week/day/list views |
| Attendance admin | Regularizations / Bulk mark / Approvers, **five stat cards** with independently coloured numbers (Pending amber, Approved green, Rejected red, and a composite "Decided by you 0 ✓ · 0 ✕") |
| Leaves | **Nine** sub-tabs, a "Open My Leaves →" helper link, **chip** filters rather than selects, and Request Leave |
| Overtime | No sub-tabs — a From/To description referencing Payroll → Overtime, status filter, Log overtime |
| Overtime report | A **From / To / Employee filter card** with a disabled Export CSV, then a two-metric card (Days with OT · Total OT in range) |
| Timesheets | Status filter and a **New timesheet dialog** — Employee / Period start / Period end, an Entries sub-card with Add entry, Notes, and a Create button disabled until the form is valid |

The empty state is data-driven too: a page with an `empty` sentence renders it as body text,
while one without promotes its sub-tab's text to a heading — so Leaves shows just
"No leave requests" rather than printing it twice.

**Development & Care** introduce two more structures:

| Page | Shape |
| --- | --- |
| Performance | A **mode pill group above the title** (My performance / Setup), underlined sub-tabs below it (My review / Reviews I give), and an amber **notice** with its own "Create my employee record" action instead of an empty card |
| Training | Programs / Enrollments, each sub-tab carrying its own note line and action, and a **New training program** dialog (Code / Category / Delivery, Title, Description, Duration / Cost / Currency, Provider / Max participants, Prerequisites, Certification offered + Active) |
| Skills | Library / Employee skills / Coverage — **each with a different toolbar**: a note + New skill; two filters + Bulk import + Add employee skill; or a lone "Pick a skill…" select |
| Employee care | Icon sub-tabs (⚑ Grievances / ♡ Health insurance), two filters, and a **File a grievance** dialog with a File anonymously checkbox |
| Announcements | No blurb — just the title and New Announcement, and a dialog whose Category and Audience selects carry their own "not configured yet" hints |

Dialogs are data too: `HrDialog` renders any page's or sub-tab's field spec — text, textarea,
select with hint, number, date, checkbox, and the Entries sub-card — so a new dialog is a
list of fields, not a new component. Submit stays disabled because nothing persists.

**Settings** is a flat list of 21 tenant taxonomies — General, Departments, Designations,
Locations, Work Modes, Leave Types, Employment Types, Bands, Attendance Statuses, Alternate
Saturdays, Recruitment Stages, Applicant Sources, Interview Rounds, Announcement Categories,
Leave Approvals, Email Branding, Integrations, Custom Fields, AI Agents, Customizations,
Change History — not the grouped nav other settings screens use.

Most are list editors sharing one shape: title, description, "No items configured. Add one
below.", then an inline add row whose Add button enables once you type, beside Bulk add. The
seven that configure rather than enumerate (General, Email Branding, Integrations, AI Agents,
Customizations, Change History) render as panels instead. Interview Rounds is transcribed
verbatim, including its note that completing a round writes its name into the applicant's
stage; the rest follow its pattern with copy fitted to each taxonomy.

Those pages and the nav tree are transcribed. `Attendance` itself was still loading when
captured, so it remains patterned, as does Separation.

`/app/me` keeps the second-column portal layout — that is how the live product renders it.

### What is observed vs. extended

The sidebar, Overview dashboard, Marketplace, Inbox, the CRM and HR apps, and the My
Workspace portal (including its "No employee profile linked" state) are matched from
screenshots. Within the apps, what was observed is: CRM's ten tabs and
every panel shown above; HR's full navigation tree, its Recruitment page, and its dashboard
metrics. The **copy and sub-tabs on HR's other pages follow the observed pattern** rather
than transcription.

## Notes

- Auth is a **client-side stub** — no backend, no real credentials. Nothing here should be
  pointed at production identity.
- Deploying the build needs SPA fallback (rewrite all paths to `index.html`), otherwise a
  hard refresh on `/register` 404s.
- Accessibility: labelled fields with `aria-invalid` + `aria-describedby`, `aria-pressed`
  on the selection grids, visible focus rings, and the marquee stops under
  `prefers-reduced-motion`.
