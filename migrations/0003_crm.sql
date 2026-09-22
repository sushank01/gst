-- 0003 — CRM: a real party model.
--
-- The prototype stored leads, contacts, companies and deals as independent
-- blobs whose relationships were *display-name strings*: a deal's "company" was
-- the text someone typed, so renaming an account orphaned its deals and two
-- spellings were two companies. This replaces that with foreign keys.
--
-- Accounts and people share a `parties` table. A lead, a contact and a customer
-- are the same person at different moments; modelling them separately is why
-- converting a lead in the prototype lost its history.

create table parties (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  company_id    uuid        references companies (id) on delete set null,
  kind          text        not null check (kind in ('organisation', 'person')),
  name          text        not null,
  -- Organisation this person belongs to. Self-referencing so a person and their
  -- employer live in one table with one id space.
  parent_id     uuid        references parties (id) on delete set null,

  email         text,
  phone         text,
  website       text,
  industry      text,
  employee_count integer,
  -- Prospect / Client / Vendor / Supplier — a classification, not a lifecycle.
  party_type    text,
  owner_user_id uuid        references users (id) on delete set null,
  tags          text[]      not null default '{}',
  notes         text,

  -- Set when a merge folds this record into another. The row is kept so links
  -- that pointed here still resolve, instead of being deleted out from under
  -- a deal's history.
  merged_into   uuid        references parties (id) on delete set null,
  archived_at   timestamptz,
  version       integer     not null default 1,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index parties_tenant_kind_idx on parties (tenant_id, kind) where archived_at is null;
create index parties_parent_idx on parties (parent_id);
create index parties_owner_idx on parties (tenant_id, owner_user_id);
-- Case-insensitive email uniqueness per tenant, ignoring archived and merged
-- rows so a merge or archive does not block re-using the address later.
create unique index parties_tenant_email_key on parties (tenant_id, lower(email))
  where email is not null and archived_at is null and merged_into is null;
create index parties_name_idx on parties (tenant_id, lower(name));

create table pipelines (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  is_default  boolean     not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index pipelines_one_default on pipelines (tenant_id) where is_default and archived_at is null;

create table pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  pipeline_id  uuid        not null references pipelines (id) on delete cascade,
  name         text        not null,
  position     integer     not null,
  probability  integer     not null default 0 check (probability between 0 and 100),
  -- open / won / lost. Reports must not infer an outcome from a stage's name.
  outcome      text        not null default 'open' check (outcome in ('open', 'won', 'lost')),
  created_at   timestamptz not null default now()
);
create unique index pipeline_stage_position_key on pipeline_stages (pipeline_id, position);
create index pipeline_stages_tenant_idx on pipeline_stages (tenant_id);

create table leads (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  -- The person this lead is about. A lead is a *stage of interest* in a party,
  -- not a separate kind of record.
  party_id       uuid        not null references parties (id) on delete cascade,
  status         text        not null default 'New',
  source         text,
  score          integer     not null default 0 check (score between 0 and 100),
  owner_user_id  uuid        references users (id) on delete set null,
  notes          text,
  -- Conversion keeps the lead row and points at what it became, so the history
  -- survives instead of the record disappearing from the list.
  converted_at        timestamptz,
  converted_deal_id   uuid,
  disqualified_reason text,
  archived_at    timestamptz,
  version        integer     not null default 1,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index leads_tenant_status_idx on leads (tenant_id, status) where archived_at is null;
create index leads_party_idx on leads (party_id);
create index leads_owner_idx on leads (tenant_id, owner_user_id);

create table deals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  pipeline_id    uuid        not null references pipelines (id) on delete restrict,
  stage_id       uuid        not null references pipeline_stages (id) on delete restrict,
  name           text        not null,
  -- Foreign keys, not the typed company name the prototype stored.
  account_id     uuid        references parties (id) on delete set null,
  primary_contact_id uuid    references parties (id) on delete set null,
  -- Money as numeric plus its own currency: a tenant may quote in more than one.
  amount         numeric(18,4) not null default 0,
  currency       char(3)     not null,
  probability    integer     check (probability between 0 and 100),
  expected_close date,
  closed_at      timestamptz,
  outcome        text        check (outcome in ('won', 'lost')),
  lost_reason    text,
  source         text,
  owner_user_id  uuid        references users (id) on delete set null,
  is_favourite   boolean     not null default false,
  archived_at    timestamptz,
  version        integer     not null default 1,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index deals_tenant_stage_idx on deals (tenant_id, stage_id) where archived_at is null;
create index deals_account_idx on deals (account_id);
create index deals_owner_idx on deals (tenant_id, owner_user_id);
create index deals_close_idx on deals (tenant_id, expected_close);

-- Every stage move, so a funnel report measures real transitions rather than
-- the current stage of whatever survived.
create table deal_stage_history (
  id            bigserial primary key,
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  deal_id       uuid        not null references deals (id) on delete cascade,
  from_stage_id uuid        references pipeline_stages (id) on delete set null,
  to_stage_id   uuid        not null references pipeline_stages (id) on delete restrict,
  moved_by      uuid        references users (id) on delete set null,
  moved_at      timestamptz not null default now(),
  note          text
);
create index deal_stage_history_deal_idx on deal_stage_history (deal_id, moved_at);

create table activities (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  company_id    uuid        references companies (id) on delete set null,
  kind          text        not null,
  subject       text        not null,
  body          text,
  -- What it is about. Exactly one target, enforced below.
  party_id      uuid        references parties (id) on delete cascade,
  deal_id       uuid        references deals (id) on delete cascade,
  lead_id       uuid        references leads (id) on delete cascade,
  owner_user_id uuid        references users (id) on delete set null,
  -- Calendar events carry a zone; "3pm" without one is not a time.
  occurs_at     timestamptz,
  timezone      text,
  duration_minutes integer,
  completed_at  timestamptz,
  outcome       text,
  version       integer     not null default 1,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint activity_has_one_target check (
    (party_id is not null)::int + (deal_id is not null)::int + (lead_id is not null)::int = 1
  )
);
create index activities_tenant_time_idx on activities (tenant_id, occurs_at);
create index activities_deal_idx on activities (deal_id);
create index activities_party_idx on activities (party_id);
create index activities_open_idx on activities (tenant_id, completed_at) where completed_at is null;
