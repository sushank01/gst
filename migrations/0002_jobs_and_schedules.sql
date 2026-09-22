-- 0002 — durable jobs and recurring schedules.
--
-- The prototype's schedules are definitions with a toggle and a fake "run now".
-- Nothing calculates an occurrence, nothing claims work, nothing retries. These
-- tables are the state a real dispatcher needs, and they are deliberately
-- independent of *where* the work finally executes (decision D1): a local
-- worker, a Vercel function and a remote container all claim from here.

create table schedules (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  name           text        not null,
  -- What runs. `target_ref` is resolved by the handler registered for `kind`.
  kind           text        not null,
  target_ref     text,
  payload        jsonb       not null default '{}'::jsonb,

  -- Five-field cron. Stored with its IANA zone because "every day at 09:00"
  -- means a different UTC instant in summer and winter; storing only UTC would
  -- silently shift the user's schedule twice a year.
  cron           text        not null,
  timezone       text        not null default 'UTC',

  -- What to do when an occurrence is still running: skip the new one, queue it,
  -- or allow concurrent runs. The prototype had no answer to this.
  overlap_policy text        not null default 'skip'
                   check (overlap_policy in ('skip', 'queue', 'allow')),
  -- How far back a dispatcher that was down may catch up. Beyond this the
  -- missed occurrences are recorded as missed rather than run in a burst.
  catchup_window_seconds integer not null default 3600,

  active         boolean     not null default true,
  last_run_at    timestamptz,
  last_status    text,
  next_run_at    timestamptz,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index schedules_tenant_idx on schedules (tenant_id);
create index schedules_due_idx on schedules (next_run_at) where active;

-- One row per unit of work. A schedule produces these; so does any request that
-- needs work to outlive it.
create table jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid        references tenants (id) on delete cascade,
  company_id      uuid        references companies (id) on delete set null,
  schedule_id     uuid        references schedules (id) on delete set null,
  kind            text        not null,
  payload         jsonb       not null default '{}'::jsonb,

  status          text        not null default 'queued'
                    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'dead')),
  -- The occurrence this job represents. Unique per schedule, so a dispatcher
  -- that runs twice — or two dispatchers racing — cannot create the same
  -- occurrence twice. This is the fix for the prototype's subscription sweep,
  -- which re-invoiced everything on every click.
  occurrence_at   timestamptz,

  attempts        integer     not null default 0,
  max_attempts    integer     not null default 3,
  available_at    timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,

  -- Lease: who holds it and until when. A worker that dies releases its work by
  -- timeout instead of stranding it.
  locked_by       text,
  locked_until    timestamptz,
  -- Fencing token. Incremented on every claim; a late result carrying an old
  -- token is rejected rather than overwriting a newer attempt.
  fence           bigint      not null default 0,

  progress        integer     not null default 0 check (progress between 0 and 100),
  -- Where a bounded step got to, so the next step resumes instead of restarting.
  checkpoint      jsonb,
  result          jsonb,
  last_error      text,
  created_at      timestamptz not null default now()
);
create unique index jobs_schedule_occurrence_key on jobs (schedule_id, occurrence_at)
  where schedule_id is not null and occurrence_at is not null;
create index jobs_claim_idx on jobs (status, available_at) where status in ('queued', 'running');
create index jobs_tenant_time_idx on jobs (tenant_id, created_at desc);

-- Every attempt, kept after the job row's own fields are overwritten by a retry.
create table job_runs (
  id           bigserial primary key,
  job_id       uuid        not null references jobs (id) on delete cascade,
  attempt      integer     not null,
  fence        bigint      not null,
  worker       text,
  status       text        not null check (status in ('running', 'succeeded', 'failed', 'cancelled', 'timeout')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  duration_ms  integer,
  error        text,
  steps        jsonb       not null default '[]'::jsonb
);
create index job_runs_job_idx on job_runs (job_id, attempt);

-- Occurrences the dispatcher could not run inside the catch-up window. Recorded
-- rather than silently skipped, so "why did this not run" has an answer.
create table missed_occurrences (
  id            bigserial primary key,
  schedule_id   uuid        not null references schedules (id) on delete cascade,
  occurrence_at timestamptz not null,
  reason        text        not null,
  noticed_at    timestamptz not null default now()
);
create unique index missed_occurrence_key on missed_occurrences (schedule_id, occurrence_at);
