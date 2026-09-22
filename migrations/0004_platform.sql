-- 0004 — platform services shared by every app.
--
-- Files, notifications, app installation + entitlement, the credit ledger,
-- versioned per-app settings, and guardrail policies. These are the tables the
-- domain migrations that follow depend on, so they land first.

-- ---------------------------------------------------------------- files ----
-- A row here is metadata about bytes held in object storage. The prototype
-- stored filenames (and sometimes a base64 data URL) and called that an upload;
-- `storage_key` plus `status` is what makes the difference between "a name was
-- typed" and "bytes exist and have been checked".
create table files (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  -- Where the bytes live. Null until the client completes the upload.
  storage_key    text,
  filename       text        not null,
  content_type   text        not null,
  byte_size      bigint      not null check (byte_size >= 0),
  -- Content hash, for dedup and for proving the bytes did not change.
  checksum_sha256 text,
  status         text        not null default 'pending'
                   check (status in ('pending', 'uploaded', 'scanning', 'clean', 'infected', 'rejected', 'deleted')),
  scan_result    text,
  -- What the file belongs to. Deliberately loose: receipts, HR documents, KB
  -- uploads and RFPs all need it, and a column per owner would not scale.
  owner_kind     text,
  owner_id       uuid,
  uploaded_by    uuid        references users (id) on delete set null,
  -- Versioning: a replacement points at what it supersedes rather than
  -- destroying it, so an approved expense keeps the receipt it was approved on.
  supersedes_id  uuid        references files (id) on delete set null,
  version        integer     not null default 1,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index files_tenant_owner_idx on files (tenant_id, owner_kind, owner_id);
create index files_tenant_status_idx on files (tenant_id, status);
create unique index files_storage_key on files (storage_key) where storage_key is not null;

-- Short-lived, single-use download grants. A file URL must not be a permanent
-- capability that leaks in a log or a referrer.
create table file_grants (
  id           uuid primary key default gen_random_uuid(),
  file_id      uuid        not null references files (id) on delete cascade,
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  token_hash   text        not null,
  issued_to    uuid        references users (id) on delete set null,
  purpose      text        not null default 'download',
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index file_grants_token on file_grants (token_hash);
create index file_grants_expiry on file_grants (expires_at);

-- --------------------------------------------------------- notifications ----
-- Read state is per user, so one person reading a notice does not mark it read
-- for their colleagues — which a single `read` boolean on a shared row would.
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  kind         text        not null,
  title        text        not null,
  body         text,
  -- Where clicking it should go.
  link         text,
  resource     text,
  resource_id  text,
  severity     text        not null default 'info' check (severity in ('info', 'success', 'warning', 'error')),
  created_at   timestamptz not null default now()
);
create index notifications_tenant_time_idx on notifications (tenant_id, created_at desc);

create table notification_recipients (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid        not null references notifications (id) on delete cascade,
  user_id         uuid        not null references users (id) on delete cascade,
  read_at         timestamptz,
  archived_at     timestamptz
);
create unique index notification_recipient_key on notification_recipients (notification_id, user_id);
create index notification_unread_idx on notification_recipients (user_id) where read_at is null;

create table notification_preferences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  user_id     uuid        not null references users (id) on delete cascade,
  kind        text        not null,
  in_app      boolean     not null default true,
  email       boolean     not null default true,
  updated_at  timestamptz not null default now()
);
create unique index notification_pref_key on notification_preferences (tenant_id, user_id, kind);

-- ------------------------------------------------- apps and entitlements ----
create table app_installations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  app_code      text        not null,
  status        text        not null default 'installed'
                  check (status in ('installed', 'disabled', 'uninstalled')),
  installed_by  uuid        references users (id) on delete set null,
  installed_at  timestamptz not null default now(),
  disabled_at   timestamptz,
  uninstalled_at timestamptz,
  settings      jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);
create unique index app_installations_key on app_installations (tenant_id, app_code);

/*
 * Plans exist as a *mechanism* here. Whether the prices copied from the
 * marketing site are real, and whether anyone may be charged them, is decision
 * D4 — so nothing in this migration asserts a price is authorised. `plans` is
 * seeded by an operator, never by the app.
 */
create table plans (
  id              uuid primary key default gen_random_uuid(),
  code            text        not null,
  version         integer     not null default 1,
  name            text        not null,
  monthly_amount  numeric(18,4),
  annual_amount   numeric(18,4),
  currency        char(3),
  app_quota       integer,
  user_quota      integer,
  monthly_credits integer,
  trial_days      integer     not null default 14,
  active          boolean     not null default true,
  created_at      timestamptz not null default now()
);
create unique index plans_code_version on plans (code, version);

create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants (id) on delete cascade,
  plan_id         uuid        references plans (id) on delete restrict,
  status          text        not null default 'trialing'
                    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  -- A real date, not a constant. The prototype hard-coded "13 days left".
  trial_ends_at   timestamptz,
  period_start    timestamptz,
  period_end      timestamptz,
  cancelled_at    timestamptz,
  provider        text,
  provider_ref    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index subscriptions_tenant_active on subscriptions (tenant_id)
  where status in ('trialing', 'active', 'past_due');

/*
 * Immutable credit ledger. Balance is the sum of entries, never a mutable
 * counter — a counter cannot be audited and loses to a concurrent update.
 * Reservation is a negative entry that a settle or refund later resolves, so a
 * failed generation refunds rather than silently charging for nothing.
 */
create table credit_entries (
  id            bigserial primary key,
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  user_id       uuid        references users (id) on delete set null,
  kind          text        not null
                  check (kind in ('grant', 'reserve', 'settle', 'refund', 'expire', 'adjust')),
  -- Signed: grants and refunds are positive, reservations and settlements negative.
  amount        integer     not null,
  -- Links a settle/refund back to the reservation it resolves.
  reservation_id bigint     references credit_entries (id) on delete set null,
  reason         text        not null,
  resource       text,
  resource_id    text,
  -- Collapses duplicate charges from a retried request.
  idempotency_key text,
  period_start  timestamptz,
  period_end    timestamptz,
  created_at    timestamptz not null default now()
);
create index credit_entries_tenant_idx on credit_entries (tenant_id, created_at desc);
create unique index credit_entries_idempotency on credit_entries (tenant_id, idempotency_key)
  where idempotency_key is not null;
create index credit_entries_reservation_idx on credit_entries (reservation_id) where reservation_id is not null;

-- ---------------------------------------------------- per-app settings ----
/*
 * One versioned settings document per (tenant, app, section).
 *
 * Every app's settings screens — Support's fourteen panes, POS's nine, ITAM's
 * taxonomies — are the same shape: a JSON document someone edits, with a
 * "Change History" tab beside it. Modelling that once gives every app real
 * history and a real revert, instead of each storing a blob with no past.
 */
create table app_settings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  company_id  uuid        references companies (id) on delete cascade,
  app_code    text        not null,
  section     text        not null,
  value       jsonb       not null default '{}'::jsonb,
  version     integer     not null default 1,
  updated_by  uuid        references users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create unique index app_settings_key on app_settings
  (tenant_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), app_code, section);

create table app_settings_changes (
  id          bigserial primary key,
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  setting_id  uuid        not null references app_settings (id) on delete cascade,
  app_code    text        not null,
  section     text        not null,
  version     integer     not null,
  summary     text        not null,
  -- Enough to restore, which is what makes "revert" more than a label.
  before      jsonb,
  after       jsonb,
  changed_by  uuid        references users (id) on delete set null,
  reverted_at timestamptz,
  changed_at  timestamptz not null default now()
);
create index app_settings_changes_idx on app_settings_changes (tenant_id, app_code, changed_at desc);

-- ------------------------------------------------------------ guardrails ----
create table guardrail_policies (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  name         text        not null,
  kind         text        not null
                 check (kind in ('keyword', 'content', 'pii', 'spend', 'rate', 'schema')),
  -- Where it runs. A policy that names no checkpoint enforces nothing.
  checkpoint   text        not null
                 check (checkpoint in ('input', 'output', 'tool_call', 'tool_result')),
  action       text        not null
                 check (action in ('block', 'warn', 'redact', 'human_review')),
  config       jsonb       not null default '{}'::jsonb,
  -- What happens if the evaluator itself fails: fail closed or fail open. A
  -- guardrail with no answer here is a guardrail you cannot reason about.
  failure_mode text        not null default 'closed' check (failure_mode in ('open', 'closed')),
  active       boolean     not null default true,
  version      integer     not null default 1,
  created_by   uuid        references users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index guardrail_policies_tenant_idx on guardrail_policies (tenant_id, checkpoint) where active;

create table guardrail_violations (
  id           bigserial primary key,
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  policy_id    uuid        references guardrail_policies (id) on delete set null,
  policy_version integer,
  checkpoint   text        not null,
  action_taken text        not null,
  resource     text,
  resource_id  text,
  run_id       uuid,
  -- The matched excerpt only, already redacted. Never the whole payload.
  excerpt      text,
  detail       jsonb       not null default '{}'::jsonb,
  actor_user_id uuid       references users (id) on delete set null,
  occurred_at  timestamptz not null default now()
);
create index guardrail_violations_idx on guardrail_violations (tenant_id, occurred_at desc);
