-- 0006 — Asset Management (ITAM).
--
-- Two things the prototype could not express: an asset's custodian over time,
-- and the difference between archiving an asset and destroying its financial
-- history. Both are modelled as events here — "who has it now" is derived from
-- the assignment history rather than stored as a field that overwrites itself.

create table asset_taxonomies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  code        text        not null,
  label       text        not null,
  -- Some taxonomies only make sense under a parent (a Model belongs to a Make).
  parent_code text,
  created_at  timestamptz not null default now()
);
create unique index asset_taxonomy_key on asset_taxonomies (tenant_id, code);

create table asset_taxonomy_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  taxonomy_code text        not null,
  value         text        not null,
  label         text        not null,
  -- The parent entry this depends on, e.g. a Model's Make. Validation is what
  -- stops "iPhone 15" being filed under "Dell".
  parent_entry_id uuid      references asset_taxonomy_entries (id) on delete cascade,
  position      integer     not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index asset_taxonomy_entry_key on asset_taxonomy_entries (tenant_id, taxonomy_code, lower(value));
create index asset_taxonomy_entry_parent on asset_taxonomy_entries (parent_entry_id);

create table asset_tag_sequences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  prefix      text        not null,
  next_value  bigint      not null default 1,
  padding     integer     not null default 4,
  updated_at  timestamptz not null default now()
);
create unique index asset_tag_sequence_key on asset_tag_sequences (tenant_id, prefix);

create table assets (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  -- The physical label. Unique per tenant because it is what someone reads off
  -- the sticker to find the record.
  tag            text        not null,
  name           text        not null,
  asset_type     text,
  make           text,
  model          text,
  serial_number  text,
  status         text        not null default 'in_stock'
                   check (status in ('in_stock', 'assigned', 'in_service', 'retired', 'lost', 'disposed')),
  condition      text,
  location       text,

  acquired_on    date,
  mode_of_purchase text,
  purchase_cost  numeric(18,4),
  currency       char(3),
  supplier_party_id uuid     references parties (id) on delete set null,
  invoice_ref    text,
  warranty_expires_on date,
  -- Straight-line depreciation inputs. Method deliberately not assumed — an
  -- accounting policy is a decision, not something to infer from a card.
  useful_life_months integer,
  salvage_value  numeric(18,4),

  custom_fields  jsonb       not null default '{}'::jsonb,
  notes          text,
  -- Archived, never deleted: an asset carries custody and financial history
  -- that a DELETE would take with it.
  archived_at    timestamptz,
  version        integer     not null default 1,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index assets_tag_key on assets (tenant_id, lower(tag));
create index assets_tenant_status_idx on assets (tenant_id, status) where archived_at is null;
create index assets_serial_idx on assets (tenant_id, lower(serial_number)) where serial_number is not null;
create index assets_warranty_idx on assets (tenant_id, warranty_expires_on) where warranty_expires_on is not null;

/*
 * Custody over time. The partial unique index is the rule that matters: an
 * asset can have at most one open assignment, so it cannot be issued to two
 * people. The prototype stored a single `assignedTo` string, which silently
 * overwrote the previous holder and lost the handover entirely.
 */
create table asset_assignments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants (id) on delete cascade,
  asset_id        uuid        not null references assets (id) on delete cascade,
  -- Whoever holds it: an employee record once HR exists, or a platform user.
  holder_user_id  uuid        references users (id) on delete set null,
  holder_party_id uuid        references parties (id) on delete set null,
  holder_label    text,
  assigned_by     uuid        references users (id) on delete set null,
  assigned_at     timestamptz not null default now(),
  due_back_on     date,
  returned_at     timestamptz,
  returned_condition text,
  return_note     text
);
create unique index asset_one_open_custody on asset_assignments (asset_id) where returned_at is null;
create index asset_assignments_holder_idx on asset_assignments (tenant_id, holder_user_id) where returned_at is null;

create table asset_events (
  id          bigserial primary key,
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  asset_id    uuid        not null references assets (id) on delete cascade,
  kind        text        not null,
  from_value  text,
  to_value    text,
  note        text,
  cost        numeric(18,4),
  currency    char(3),
  actor_user_id uuid      references users (id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index asset_events_idx on asset_events (asset_id, occurred_at desc);

create table asset_service_records (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  asset_id     uuid        not null references assets (id) on delete cascade,
  kind         text        not null,
  vendor_party_id uuid     references parties (id) on delete set null,
  started_on   date        not null,
  completed_on date,
  cost         numeric(18,4),
  currency     char(3),
  notes        text,
  created_by   uuid        references users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index asset_service_idx on asset_service_records (asset_id, started_on desc);

create table asset_retirements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  asset_id      uuid        not null references assets (id) on delete cascade,
  reason        text        not null,
  method        text,
  proceeds      numeric(18,4),
  currency      char(3),
  retired_on    date        not null,
  approved_by   uuid        references users (id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);
create unique index asset_retirement_key on asset_retirements (asset_id);

-- ------------------------------------------------------------- requests ----
create table asset_approval_levels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  level       integer     not null,
  approver_kind text      not null check (approver_kind in ('role', 'user')),
  approver_role text,
  created_at  timestamptz not null default now()
);
create unique index asset_approval_level_key on asset_approval_levels (tenant_id, level);

create table asset_approval_level_users (
  id        uuid primary key default gen_random_uuid(),
  level_id  uuid not null references asset_approval_levels (id) on delete cascade,
  user_id   uuid not null references users (id) on delete cascade
);
create unique index asset_approval_level_user_key on asset_approval_level_users (level_id, user_id);

create table asset_requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  reference      text        not null,
  requester_user_id uuid     not null references users (id) on delete cascade,
  asset_type     text,
  asset_id       uuid        references assets (id) on delete set null,
  quantity       integer     not null default 1 check (quantity > 0),
  reason         text,
  needed_by      date,
  status         text        not null default 'submitted'
                   check (status in ('draft', 'submitted', 'approved', 'rejected', 'issued', 'cancelled')),
  current_level  integer     not null default 1,
  decided_at     timestamptz,
  issued_at      timestamptz,
  version        integer     not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index asset_request_reference on asset_requests (tenant_id, reference);
create index asset_requests_status_idx on asset_requests (tenant_id, status);

create table asset_request_approvals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  request_id   uuid        not null references asset_requests (id) on delete cascade,
  level        integer     not null,
  decided_by   uuid        references users (id) on delete set null,
  decision     text        check (decision in ('approved', 'rejected')),
  note         text,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
-- One decision per level per request: a double-click cannot approve twice.
create unique index asset_request_approval_key on asset_request_approvals (request_id, level);

create table asset_import_batches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  file_id     uuid        references files (id) on delete set null,
  status      text        not null default 'staged'
                check (status in ('staged', 'validated', 'committed', 'failed', 'cancelled')),
  row_count   integer     not null default 0,
  error_count integer     not null default 0,
  errors      jsonb       not null default '[]'::jsonb,
  created_by  uuid        references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  committed_at timestamptz
);
create index asset_import_batches_idx on asset_import_batches (tenant_id, created_at desc);
