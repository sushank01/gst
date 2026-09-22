/*
 * The tenant's own compliance registers.
 *
 * A distinction worth stating, because the previous version of this feature
 * got it wrong in both directions. Recording what you process, why, and for
 * how long is something a tenant does for themselves; it needs storage and
 * nothing else. Asserting that a data transfer is covered by standard
 * contractual clauses is a legal position, and this product may not make one
 * on anybody's behalf — the screens shipped with a register claiming exactly
 * that, and it has been deleted.
 *
 * So: these tables hold what a tenant writes. Nothing reads them to enforce
 * anything, and the screen says so. A retention policy recorded here deletes
 * no data, because no purge job exists — pretending otherwise would be the
 * more dangerous failure, since somebody might rely on it in an audit.
 */

create table compliance_inventory_fields (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  entity      text        not null,
  field       text        not null,
  category    text        not null
                check (category in ('basic', 'contact', 'identifier', 'location', 'behavioural', 'special_category')),
  sensitive   boolean     not null default false,
  legal_basis text        not null,
  retention   text,
  notes       text,
  created_by  uuid        references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- One row per field: a duplicate entry is a register that counts the same
-- personal data twice, which is worse than one that misses it.
create unique index compliance_inventory_key on compliance_inventory_fields (tenant_id, lower(entity), lower(field));

create table compliance_data_flows (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  name         text        not null,
  direction    text        not null check (direction in ('ingress', 'egress', 'internal')),
  source       text        not null,
  destination  text        not null,
  /*
   * Free text, and deliberately not an enum. An enum of ('SCC', 'DPA',
   * 'adequacy') would invite the product to reason about which applies; that
   * is the tenant's counsel's job, and the value is theirs to write.
   */
  cross_border text,
  created_by   uuid        references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index compliance_flow_key on compliance_data_flows (tenant_id, lower(name));

create table compliance_dpias (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  title         text        not null,
  processing    text        not null,
  risk_level    text        not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  status        text        not null default 'draft'
                  check (status in ('draft', 'in_review', 'approved', 'needs_review')),
  mitigations   text,
  owner_user_id uuid        references users (id) on delete set null,
  reviewed_on   date,
  next_review_on date,
  version       integer     not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index compliance_dpia_status_idx on compliance_dpias (tenant_id, status);

create table compliance_automated_decisions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  name          text        not null,
  description   text,
  -- Whether it profiles, and whether a person reviews the outcome. Both are
  -- the questions an Art. 22 answer turns on, so both are explicit columns
  -- rather than free text somebody has to read.
  profiling     boolean     not null default false,
  human_review  boolean     not null default false,
  logic_summary text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index compliance_decision_key on compliance_automated_decisions (tenant_id, lower(name));

create table compliance_retention_policies (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  subject        text        not null,
  keep_for_days  integer     not null check (keep_for_days > 0),
  /*
   * `enabled` records the tenant's intent. There is deliberately no
   * `last_run_at`: no purge job exists, and a column named for one would be
   * rendered as "Never" and read as "it has not run yet" rather than "nothing
   * will ever run it".
   */
  enabled        boolean     not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index compliance_retention_key on compliance_retention_policies (tenant_id, lower(subject));
