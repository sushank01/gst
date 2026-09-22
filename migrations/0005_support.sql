-- 0005 — Support & Ticketing.
--
-- The prototype had a ticket row and a list. What it did not have: a thread,
-- the distinction between a public reply and an internal note, an SLA clock
-- that respects business hours, or any path from a saved escalation rule to
-- something actually happening. Those are the tables here.

create table support_teams (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  email       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index support_teams_name_key on support_teams (tenant_id, lower(name)) where archived_at is null;

/*
 * Statuses, priorities, categories and channels are tenant-editable vocabularies,
 * not enums in code. `behaviour` is what the engine reads — an SLA clock must
 * know a status is "waiting" without pattern-matching its name, which is how a
 * renamed status silently breaks reporting.
 */
create table ticket_field_options (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  field        text        not null check (field in ('status', 'priority', 'category', 'type', 'channel')),
  slug         text        not null,
  label        text        not null,
  colour       text,
  position     integer     not null default 0,
  behaviour    text,
  -- Target first-response / resolution minutes, for priority options.
  first_response_minutes integer,
  resolution_minutes     integer,
  is_default   boolean     not null default false,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index ticket_field_option_key on ticket_field_options (tenant_id, field, slug);
create index ticket_field_options_idx on ticket_field_options (tenant_id, field, position);

create table tickets (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants (id) on delete cascade,
  company_id      uuid        references companies (id) on delete set null,
  reference       text        not null,
  subject         text        not null,
  -- The requester as a party, so a customer's tickets, deals and invoices are
  -- the same person rather than three unrelated name strings.
  requester_party_id uuid     references parties (id) on delete set null,
  requester_email text,
  requester_name  text,
  status          text        not null,
  priority        text        not null,
  category        text,
  type            text,
  channel         text        not null default 'web',
  team_id         uuid        references support_teams (id) on delete set null,
  assignee_user_id uuid       references users (id) on delete set null,
  tags            text[]      not null default '{}',
  -- Denormalised from the thread because every list view needs it and the
  -- alternative is a correlated subquery per row.
  last_activity_at timestamptz not null default now(),
  first_response_at timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  reopened_count  integer     not null default 0,
  custom_fields   jsonb       not null default '{}'::jsonb,
  version         integer     not null default 1,
  created_by      uuid        references users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index tickets_reference_key on tickets (tenant_id, reference);
create index tickets_tenant_status_idx on tickets (tenant_id, status, last_activity_at desc);
create index tickets_assignee_idx on tickets (tenant_id, assignee_user_id) where resolved_at is null;
create index tickets_requester_idx on tickets (tenant_id, requester_party_id);

/*
 * The thread. `visibility` is the whole point: an internal note must never be
 * returned to a requester, and that has to be a column the query filters on,
 * not a flag a template happens to respect.
 */
create table ticket_messages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  ticket_id     uuid        not null references tickets (id) on delete cascade,
  visibility    text        not null check (visibility in ('public', 'internal')),
  author_user_id uuid       references users (id) on delete set null,
  author_kind   text        not null default 'agent' check (author_kind in ('agent', 'requester', 'system', 'automation')),
  author_email  text,
  body          text        not null,
  body_format   text        not null default 'text' check (body_format in ('text', 'html', 'markdown')),
  -- Set for inbound email, so a reply threads onto the right ticket and a
  -- duplicate delivery does not create a second one.
  external_message_id text,
  in_reply_to   text,
  created_at    timestamptz not null default now()
);
create index ticket_messages_thread_idx on ticket_messages (ticket_id, created_at);
create unique index ticket_messages_external_key on ticket_messages (tenant_id, external_message_id)
  where external_message_id is not null;

create table ticket_attachments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  ticket_id   uuid        not null references tickets (id) on delete cascade,
  message_id  uuid        references ticket_messages (id) on delete cascade,
  file_id     uuid        not null references files (id) on delete restrict,
  created_at  timestamptz not null default now()
);
create index ticket_attachments_idx on ticket_attachments (ticket_id);

create table ticket_events (
  id           bigserial primary key,
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  ticket_id    uuid        not null references tickets (id) on delete cascade,
  kind         text        not null,
  from_value   text,
  to_value     text,
  actor_user_id uuid       references users (id) on delete set null,
  actor_kind   text        not null default 'user',
  occurred_at  timestamptz not null default now()
);
create index ticket_events_idx on ticket_events (ticket_id, occurred_at);

create table ticket_participants (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  ticket_id   uuid        not null references tickets (id) on delete cascade,
  party_id    uuid        references parties (id) on delete cascade,
  user_id     uuid        references users (id) on delete cascade,
  email       text,
  role        text        not null default 'cc' check (role in ('requester', 'cc', 'follower')),
  created_at  timestamptz not null default now(),
  constraint participant_identified check (party_id is not null or user_id is not null or email is not null)
);
create index ticket_participants_idx on ticket_participants (ticket_id);

-- ------------------------------------------------------------------ SLA ----
/*
 * Business calendars, so an SLA measures working time. A four-hour target
 * started at 17:00 on Friday is not breached at 21:00 — the prototype had no
 * way to express that, which made every SLA number wrong out of hours.
 */
create table business_calendars (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  timezone    text        not null default 'UTC',
  is_default  boolean     not null default false,
  created_at  timestamptz not null default now()
);
create unique index business_calendar_default on business_calendars (tenant_id) where is_default;

create table business_hours (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid        not null references business_calendars (id) on delete cascade,
  weekday      integer     not null check (weekday between 0 and 6),
  opens_minute integer     not null check (opens_minute between 0 and 1440),
  closes_minute integer    not null check (closes_minute between 0 and 1440),
  constraint business_hours_ordered check (closes_minute > opens_minute)
);
create index business_hours_idx on business_hours (calendar_id, weekday);

create table business_holidays (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid        not null references business_calendars (id) on delete cascade,
  observed_on date        not null,
  name        text        not null
);
create unique index business_holiday_key on business_holidays (calendar_id, observed_on);

create table sla_policies (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  name          text        not null,
  calendar_id   uuid        references business_calendars (id) on delete set null,
  -- Which tickets it applies to: priority, category, tier.
  applies_to    jsonb       not null default '{}'::jsonb,
  first_response_minutes integer,
  resolution_minutes     integer,
  active        boolean     not null default true,
  created_at    timestamptz not null default now()
);

/*
 * A live clock per ticket per target. Pausing is real: `paused_ms` accumulates
 * while the ticket waits on the customer, so a reply does not restart the clock
 * and waiting on the requester does not burn the agent's budget.
 */
create table sla_instances (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  ticket_id     uuid        not null references tickets (id) on delete cascade,
  policy_id     uuid        references sla_policies (id) on delete set null,
  target        text        not null check (target in ('first_response', 'resolution')),
  started_at    timestamptz not null,
  due_at        timestamptz not null,
  paused_at     timestamptz,
  paused_ms     bigint      not null default 0,
  satisfied_at  timestamptz,
  breached_at   timestamptz,
  escalated_at  timestamptz
);
create unique index sla_instance_key on sla_instances (ticket_id, target);
create index sla_due_idx on sla_instances (tenant_id, due_at) where satisfied_at is null and breached_at is null;

create table escalation_rules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  name         text        not null,
  -- before / on / after the SLA boundary, in minutes.
  trigger_target text      not null check (trigger_target in ('first_response', 'resolution')),
  offset_minutes integer   not null default 0,
  conditions   jsonb       not null default '{}'::jsonb,
  -- notify, reassign, raise_priority — each with its own config.
  actions      jsonb       not null default '[]'::jsonb,
  active       boolean     not null default true,
  created_at   timestamptz not null default now()
);

create table escalation_events (
  id          bigserial primary key,
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  rule_id     uuid        references escalation_rules (id) on delete set null,
  ticket_id   uuid        not null references tickets (id) on delete cascade,
  action      text        not null,
  outcome     text        not null,
  detail      jsonb       not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
-- One firing per rule per ticket per target boundary; re-running the sweep is safe.
create unique index escalation_once_key on escalation_events (rule_id, ticket_id, action);

-- ------------------------------------------------------- knowledge base ----
create table kb_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  slug        text        not null,
  position    integer     not null default 0,
  archived_at timestamptz
);
create unique index kb_category_slug on kb_categories (tenant_id, lower(slug));

create table kb_articles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  category_id   uuid        references kb_categories (id) on delete set null,
  slug          text        not null,
  title         text        not null,
  body          text        not null default '',
  -- Draft vs published is an access control, not a label: an unpublished
  -- article must not surface in a portal search.
  status        text        not null default 'draft' check (status in ('draft', 'published', 'archived')),
  visibility    text        not null default 'internal' check (visibility in ('internal', 'portal', 'public')),
  published_version integer,
  version       integer     not null default 1,
  author_user_id uuid       references users (id) on delete set null,
  published_at  timestamptz,
  view_count    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index kb_article_slug on kb_articles (tenant_id, lower(slug));
create index kb_article_status_idx on kb_articles (tenant_id, status, visibility);

create table kb_article_versions (
  id          bigserial primary key,
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  article_id  uuid        not null references kb_articles (id) on delete cascade,
  version     integer     not null,
  title       text        not null,
  body        text        not null,
  author_user_id uuid     references users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index kb_article_version_key on kb_article_versions (article_id, version);

create table canned_responses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  shortcut    text        not null,
  title       text        not null,
  body        text        not null,
  team_id     uuid        references support_teams (id) on delete set null,
  usage_count integer     not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index canned_response_shortcut on canned_responses (tenant_id, lower(shortcut)) where archived_at is null;

-- ----------------------------------------------------------------- CSAT ----
create table csat_responses (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  ticket_id    uuid        not null references tickets (id) on delete cascade,
  token_hash   text        not null,
  score        integer     check (score between 1 and 5),
  comment      text,
  sent_at      timestamptz not null default now(),
  responded_at timestamptz,
  reviewed_by  uuid        references users (id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text
);
-- One survey per ticket: a resolved-reopened-resolved cycle must not send three.
create unique index csat_ticket_key on csat_responses (ticket_id);
create unique index csat_token_key on csat_responses (token_hash);

create table inbox_accounts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  address       text        not null,
  protocol      text        not null default 'imap',
  host          text,
  port          integer,
  username      text,
  -- Encrypted with the server key; never the password itself.
  secret_ref    text,
  team_id       uuid        references support_teams (id) on delete set null,
  status        text        not null default 'unverified'
                  check (status in ('unverified', 'connected', 'failing', 'disabled')),
  last_polled_at timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);
create unique index inbox_account_address on inbox_accounts (tenant_id, lower(address));
