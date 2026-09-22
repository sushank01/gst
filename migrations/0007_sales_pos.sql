-- 0007 — Sales & POS.
--
-- The prototype kept a `total` string on each document and a status word, so
-- "Posted" was a browser field and a subscription sweep re-invoiced everything
-- on every click. Here totals are computed from lines, documents link to the
-- ones they came from, and a subscription period can only be billed once.

create table sales_customers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  company_id    uuid        references companies (id) on delete set null,
  -- The shared party record, so a CRM account and a POS customer are one thing.
  party_id      uuid        not null references parties (id) on delete cascade,
  code          text,
  group_id      uuid,
  currency      char(3)     not null,
  credit_limit  numeric(18,4),
  payment_terms_days integer not null default 0,
  tax_id        text,
  -- A buyer registered in another state is charged inter-state tax.
  tax_region    text,
  loyalty_points integer    not null default 0,
  active        boolean     not null default true,
  version       integer     not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index sales_customer_party_key on sales_customers (tenant_id, party_id);
create unique index sales_customer_code_key on sales_customers (tenant_id, lower(code)) where code is not null;

create table customer_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  discount_percent numeric(6,3) not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index customer_group_key on customer_groups (tenant_id, lower(name)) where archived_at is null;
alter table sales_customers add constraint sales_customer_group_fk
  foreign key (group_id) references customer_groups (id) on delete set null;

/*
 * A named tax slab and how it splits. Items point at a category instead of
 * carrying a loose percentage, so changing a rate is one edit rather than an
 * edit on every affected item — and a posted document keeps the rate it was
 * posted with, which is why `tax_rate` is copied onto the line.
 */
create table tax_categories (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  name          text        not null,
  rate_percent  numeric(6,3) not null check (rate_percent >= 0),
  -- Components let one slab split into CGST/SGST within a region and IGST across.
  within_region jsonb       not null default '[]'::jsonb,
  cross_region  jsonb       not null default '[]'::jsonb,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index tax_category_key on tax_categories (tenant_id, lower(name)) where archived_at is null;

create table rate_contracts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  customer_id   uuid        references sales_customers (id) on delete cascade,
  group_id      uuid        references customer_groups (id) on delete cascade,
  reference     text        not null,
  currency      char(3)     not null,
  valid_from    date        not null,
  valid_to      date,
  -- Higher wins when two contracts could apply, so precedence is data rather
  -- than whichever row the query happened to return first.
  priority      integer     not null default 0,
  status        text        not null default 'active' check (status in ('draft', 'active', 'expired', 'cancelled')),
  version       integer     not null default 1,
  created_at    timestamptz not null default now()
);
create unique index rate_contract_reference on rate_contracts (tenant_id, reference);
create index rate_contract_lookup on rate_contracts (tenant_id, customer_id, valid_from, valid_to);

create table rate_contract_lines (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  contract_id   uuid        not null references rate_contracts (id) on delete cascade,
  item_code     text        not null,
  description   text,
  unit_price    numeric(18,4) not null check (unit_price >= 0),
  min_quantity  numeric(18,4) not null default 0,
  discount_percent numeric(6,3) not null default 0
);
create index rate_contract_line_idx on rate_contract_lines (contract_id, item_code);

-- Gapless per-kind numbering. A sequence row is locked while a document is
-- created, so two concurrent invoices cannot take the same number.
create table document_sequences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  company_id  uuid        references companies (id) on delete cascade,
  kind        text        not null,
  prefix      text        not null,
  next_value  bigint      not null default 1,
  padding     integer     not null default 4,
  updated_at  timestamptz not null default now()
);
create unique index document_sequence_key on document_sequences
  (tenant_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);

/*
 * One table for every order-to-cash document, discriminated by `kind`.
 *
 * They share numbering, a customer, currency, totals and a link to the document
 * they came from. `source_document_id` is what makes partial fulfilment and
 * three-way matching possible at all — the prototype had no link between an
 * order and the invoice that billed it.
 */
create table sales_documents (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  kind           text        not null
                   check (kind in ('quotation', 'order', 'delivery', 'invoice', 'return', 'credit_note', 'refund', 'subscription')),
  reference      text        not null,
  customer_id    uuid        references sales_customers (id) on delete restrict,
  source_document_id uuid    references sales_documents (id) on delete set null,
  status         text        not null,
  currency       char(3)     not null,

  -- Every total is derived from the lines and rewritten whenever they change.
  -- No caller may set them; they exist so a list view is not N subqueries.
  subtotal       numeric(18,4) not null default 0,
  discount_total numeric(18,4) not null default 0,
  tax_total      numeric(18,4) not null default 0,
  grand_total    numeric(18,4) not null default 0,
  paid_total     numeric(18,4) not null default 0,

  issued_on      date,
  due_on         date,
  expires_on     date,
  -- Posting to the ledger is a one-way door: a posted document is immutable and
  -- corrected by a credit note, never edited.
  posted_at      timestamptz,
  posted_by      uuid        references users (id) on delete set null,
  cancelled_at   timestamptz,
  notes          text,
  custom_fields  jsonb       not null default '{}'::jsonb,
  version        integer     not null default 1,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index sales_document_reference on sales_documents (tenant_id, kind, reference);
create index sales_document_customer_idx on sales_documents (tenant_id, customer_id, kind);
create index sales_document_status_idx on sales_documents (tenant_id, kind, status);
create index sales_document_source_idx on sales_documents (source_document_id);
create index sales_document_due_idx on sales_documents (tenant_id, due_on)
  where kind = 'invoice' and posted_at is not null;

create table sales_document_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  document_id    uuid        not null references sales_documents (id) on delete cascade,
  position       integer     not null,
  item_code      text,
  description    text        not null,
  quantity       numeric(18,4) not null check (quantity <> 0),
  unit_price     numeric(18,4) not null,
  discount_percent numeric(6,3) not null default 0,
  -- Copied from the tax category at the moment of posting, so a later rate
  -- change does not silently restate a posted invoice.
  tax_category_id uuid       references tax_categories (id) on delete set null,
  tax_rate_percent numeric(6,3) not null default 0,
  line_subtotal  numeric(18,4) not null default 0,
  line_tax       numeric(18,4) not null default 0,
  line_total     numeric(18,4) not null default 0,
  -- For partial fulfilment: how much of this line has shipped or been billed.
  fulfilled_quantity numeric(18,4) not null default 0,
  invoiced_quantity  numeric(18,4) not null default 0,
  source_line_id uuid        references sales_document_lines (id) on delete set null
);
create unique index sales_document_line_position on sales_document_lines (document_id, position);
create index sales_document_line_doc on sales_document_lines (document_id);

create table customer_payments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  company_id    uuid        references companies (id) on delete set null,
  customer_id   uuid        not null references sales_customers (id) on delete restrict,
  reference     text        not null,
  method        text        not null,
  amount        numeric(18,4) not null check (amount > 0),
  currency      char(3)     not null,
  received_on   date        not null,
  -- Provider reference, and the key that stops a retried webhook double-crediting.
  provider_ref  text,
  idempotency_key text,
  notes         text,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index customer_payment_reference on customer_payments (tenant_id, reference);
create unique index customer_payment_idempotency on customer_payments (tenant_id, idempotency_key)
  where idempotency_key is not null;

create table payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  payment_id  uuid        not null references customer_payments (id) on delete cascade,
  document_id uuid        not null references sales_documents (id) on delete restrict,
  amount      numeric(18,4) not null check (amount > 0),
  created_at  timestamptz not null default now()
);
create index payment_allocation_doc on payment_allocations (document_id);
create index payment_allocation_payment on payment_allocations (payment_id);

-- ---------------------------------------------------------- subscriptions ----
create table subscription_periods (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants (id) on delete cascade,
  subscription_id uuid        not null references sales_documents (id) on delete cascade,
  period_start    date        not null,
  period_end      date        not null,
  invoice_id      uuid        references sales_documents (id) on delete set null,
  status          text        not null default 'pending'
                    check (status in ('pending', 'invoiced', 'skipped', 'failed')),
  created_at      timestamptz not null default now()
);
/*
 * THE fix for the prototype's sweep: one row per subscription per period. A
 * second sweep for the same period conflicts instead of raising another
 * invoice, however many times the button is pressed or the dispatcher retries.
 */
create unique index subscription_period_key on subscription_periods (subscription_id, period_start);
create index subscription_period_due on subscription_periods (tenant_id, status, period_start);

-- ------------------------------------------------------------ POS till ----
create table pos_shifts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  cashier_user_id uuid       not null references users (id) on delete restrict,
  currency       char(3)     not null,
  opening_float  numeric(18,4) not null default 0,
  warehouse      text,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  counted_cash   numeric(18,4),
  -- Expected and variance are computed at close from the sale tenders, not typed.
  expected_cash  numeric(18,4),
  variance       numeric(18,4),
  variance_reason text,
  closed_by      uuid        references users (id) on delete set null,
  notes          text,
  version        integer     not null default 1
);
-- One open till per cashier: closing twice, or opening a second, is refused.
create unique index pos_shift_one_open on pos_shifts (tenant_id, cashier_user_id) where closed_at is null;
create index pos_shift_closed_idx on pos_shifts (tenant_id, closed_at desc);

create table pos_sales (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  shift_id    uuid        not null references pos_shifts (id) on delete restrict,
  document_id uuid        references sales_documents (id) on delete set null,
  reference   text        not null,
  customer_id uuid        references sales_customers (id) on delete set null,
  total       numeric(18,4) not null,
  currency    char(3)     not null,
  sold_at     timestamptz not null default now(),
  voided_at   timestamptz,
  void_reason text
);
create unique index pos_sale_reference on pos_sales (tenant_id, reference);
create index pos_sale_shift_idx on pos_sales (shift_id);

create table pos_sale_tenders (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid        not null references tenants (id) on delete cascade,
  sale_id    uuid        not null references pos_sales (id) on delete cascade,
  method     text        not null check (method in ('cash', 'card', 'upi', 'voucher', 'loyalty', 'other')),
  amount     numeric(18,4) not null check (amount > 0),
  reference  text
);
create index pos_tender_sale_idx on pos_sale_tenders (sale_id);

create table cash_variance_policies (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid        not null references tenants (id) on delete cascade,
  reason_required_above numeric(18,4) not null default 1,
  amber_worst_shift numeric(18,4) not null default 1,
  red_worst_shift   numeric(18,4) not null default 5,
  amber_average     numeric(18,4) not null default 0.5,
  red_average       numeric(18,4) not null default 2,
  updated_at        timestamptz not null default now(),
  constraint variance_red_above_amber check (red_worst_shift >= amber_worst_shift and red_average >= amber_average)
);
create unique index cash_variance_policy_key on cash_variance_policies (tenant_id);

create table match_policies (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid        not null references tenants (id) on delete cascade,
  price_tolerance_percent numeric(6,3) not null default 5,
  price_action       text        not null default 'warn' check (price_action in ('warn', 'block', 'ignore')),
  quantity_tolerance_percent numeric(6,3) not null default 2,
  quantity_action    text        not null default 'warn' check (quantity_action in ('warn', 'block', 'ignore')),
  require_order      boolean     not null default false,
  require_delivery   boolean     not null default false,
  updated_at         timestamptz not null default now()
);
create unique index match_policy_key on match_policies (tenant_id);

create table loyalty_programmes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  name           text        not null,
  points_per_unit numeric(18,4) not null default 1,
  point_value    numeric(18,4) not null default 0.01,
  currency       char(3)     not null,
  active         boolean     not null default true,
  created_at     timestamptz not null default now()
);

create table loyalty_entries (
  id            bigserial primary key,
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  customer_id   uuid        not null references sales_customers (id) on delete cascade,
  programme_id  uuid        references loyalty_programmes (id) on delete set null,
  points        integer     not null,
  reason        text        not null,
  document_id   uuid        references sales_documents (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index loyalty_entries_customer on loyalty_entries (customer_id, created_at desc);
