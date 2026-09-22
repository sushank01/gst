/*
 * Travel and expense.
 *
 * Money leaves the business here, so the structures are built around the ways
 * it leaves twice:
 *
 *  - An expense belongs to AT MOST ONE report. In the prototype a report held
 *    a total and a title, so the same restaurant bill could sit in two claims.
 *  - A card transaction matches AT MOST ONE expense, which is what makes
 *    reconciliation meaningful: a claimed lunch and its card line are one
 *    event, not two.
 *  - A report is paid AT MOST ONCE. Reimbursement items carry a unique index
 *    on the report, so a re-run of the payout batch cannot pay it again.
 *  - Every amount carries its currency and, when converted, the rate used and
 *    the resulting base amount. A figure converted twice at different rates is
 *    a discrepancy nobody can reconstruct later.
 */

create table te_expense_categories (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  name         text        not null,
  code         text        not null,
  gl_account   text,
  -- Null means no cap. Zero would mean "nothing is claimable", which is a
  -- different statement and must not be reachable by leaving a field blank.
  limit_amount numeric(18,4),
  limit_currency char(3),
  receipt_required_above numeric(18,4),
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index te_category_code_key on te_expense_categories (tenant_id, lower(code));

create table te_travel_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  company_id    uuid        references companies (id) on delete set null,
  reference     text        not null,
  employee_id   uuid        not null references hr_employees (id) on delete restrict,
  purpose       text        not null,
  trip_kind     text        not null default 'domestic' check (trip_kind in ('domestic', 'international')),
  origin        text,
  destination   text        not null,
  departs_on    date        not null,
  returns_on    date        not null,
  estimated_cost numeric(18,4),
  currency      char(3),
  project_code  text,
  budget_head   text,
  advance_requested numeric(18,4),
  status        text        not null default 'draft'
                  check (status in ('draft', 'submitted', 'approved', 'rejected', 'booked', 'in_progress', 'completed', 'cancelled')),
  current_level integer     not null default 1,
  approval_round integer    not null default 1,
  decided_at    timestamptz,
  version       integer     not null default 1,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint te_trip_dates check (returns_on >= departs_on)
);
create unique index te_travel_reference on te_travel_requests (tenant_id, reference);
create index te_travel_status_idx on te_travel_requests (tenant_id, status);
create index te_travel_employee_idx on te_travel_requests (employee_id, departs_on desc);

create table te_travel_bookings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  request_id    uuid        not null references te_travel_requests (id) on delete cascade,
  kind          text        not null check (kind in ('flight', 'train', 'bus', 'hotel', 'car', 'visa', 'other')),
  vendor        text,
  reference     text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  cost          numeric(18,4),
  currency      char(3),
  status        text        not null default 'held' check (status in ('held', 'confirmed', 'cancelled')),
  created_at    timestamptz not null default now()
);
create index te_bookings_idx on te_travel_bookings (request_id);

/*
 * Approval levels, evaluated by threshold. A level applies when the amount is
 * at or above its threshold, so a small claim skips the levels that exist for
 * large ones rather than sitting in a queue that will never look at it.
 */
create table te_approval_levels (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  level        integer     not null,
  label        text        not null,
  threshold    numeric(18,4) not null default 0,
  approver_role text       check (approver_role in ('owner', 'admin', 'member', 'viewer')),
  scope        text        not null default 'expense' check (scope in ('expense', 'travel')),
  created_at   timestamptz not null default now()
);
create unique index te_approval_level_key on te_approval_levels (tenant_id, scope, level);

create table te_approvals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  subject_kind text        not null check (subject_kind in ('expense_report', 'travel_request')),
  subject_id   uuid        not null,
  round        integer     not null default 1,
  level        integer     not null,
  decision     text        check (decision in ('approved', 'rejected')),
  decided_by   uuid        references users (id) on delete set null,
  decided_at   timestamptz,
  note         text,
  created_at   timestamptz not null default now()
);
/*
 * One decision per level per round. The round is part of the key so a
 * resubmitted claim is decided afresh while the earlier round's decisions stay
 * on record — deleting them to make room would erase who approved what.
 */
create unique index te_approval_key on te_approvals (subject_kind, subject_id, round, level);

create table te_expense_reports (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  company_id    uuid        references companies (id) on delete set null,
  reference     text        not null,
  employee_id   uuid        not null references hr_employees (id) on delete restrict,
  title         text        not null,
  travel_request_id uuid    references te_travel_requests (id) on delete set null,
  -- The currency the employee is reimbursed in. Individual expenses may be in
  -- other currencies and are converted into this one at a recorded rate.
  currency      char(3)     not null,
  status        text        not null default 'draft'
                  check (status in ('draft', 'submitted', 'approved', 'rejected', 'reimbursed', 'cancelled')),
  current_level integer     not null default 1,
  /*
   * A rejected claim that is corrected and resubmitted is a NEW approval
   * round. Without this, the level-1 decision from the first attempt would
   * still be on record and the second attempt could never be decided — or,
   * worse, would count the old approval as if it applied to the new amount.
   */
  approval_round integer    not null default 1,
  total_amount  numeric(18,4) not null default 0,
  approved_amount numeric(18,4),
  submitted_at  timestamptz,
  decided_at    timestamptz,
  reimbursed_at timestamptz,
  policy_flags  jsonb       not null default '[]'::jsonb,
  version       integer     not null default 1,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index te_report_reference on te_expense_reports (tenant_id, reference);
create index te_reports_status_idx on te_expense_reports (tenant_id, status);
create index te_reports_employee_idx on te_expense_reports (employee_id, created_at desc);

create table te_expenses (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  employee_id   uuid        not null references hr_employees (id) on delete restrict,
  /*
   * Null while the expense is unfiled. The unique index below is what stops
   * the same bill appearing in two claims — a report that merely held a total
   * could not express the constraint at all.
   */
  report_id     uuid        references te_expense_reports (id) on delete set null,
  category_id   uuid        references te_expense_categories (id) on delete set null,
  spent_on      date        not null,
  merchant      text,
  description   text,
  amount        numeric(18,4) not null check (amount > 0),
  currency      char(3)     not null,
  -- The rate used and the converted figure, both stored. Re-deriving a
  -- conversion later at a different rate is how totals stop reconciling.
  fx_rate       numeric(18,8) not null default 1 check (fx_rate > 0),
  base_amount   numeric(18,4) not null check (base_amount > 0),
  base_currency char(3)     not null,
  receipt_file_id uuid      references files (id) on delete set null,
  reimbursable  boolean     not null default true,
  policy_flags  jsonb       not null default '[]'::jsonb,
  version       integer     not null default 1,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index te_expenses_report_idx on te_expenses (report_id) where report_id is not null;
create index te_expenses_employee_idx on te_expenses (employee_id, spent_on desc);
-- Duplicate detection: the same person, day, merchant and amount twice is
-- almost always one bill claimed twice. Flagged, not blocked — two identical
-- taxi fares on one day do happen.
create index te_expense_duplicate_idx on te_expenses (employee_id, spent_on, lower(merchant), amount);

create table te_card_transactions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  employee_id   uuid        references hr_employees (id) on delete set null,
  card_last4    text,
  posted_on     date        not null,
  merchant      text        not null,
  amount        numeric(18,4) not null,
  currency      char(3)     not null,
  -- The provider's own id for the line. Unique per tenant, so re-importing a
  -- statement cannot create a second copy of every transaction.
  external_ref  text        not null,
  matched_expense_id uuid   references te_expenses (id) on delete set null,
  matched_at    timestamptz,
  matched_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index te_card_external_key on te_card_transactions (tenant_id, external_ref);
-- A card line matches at most one expense, and an expense at most one line.
create unique index te_card_match_key on te_card_transactions (matched_expense_id) where matched_expense_id is not null;
create index te_card_unmatched_idx on te_card_transactions (tenant_id, posted_on) where matched_expense_id is null;

create table te_reimbursement_runs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  reference    text        not null,
  status       text        not null default 'draft'
                 check (status in ('draft', 'approved', 'paid', 'cancelled')),
  currency     char(3)     not null,
  total_amount numeric(18,4) not null default 0,
  paid_at      timestamptz,
  version      integer     not null default 1,
  created_by   uuid        references users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index te_run_reference on te_reimbursement_runs (tenant_id, reference);

create table te_reimbursement_items (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid          not null references tenants (id) on delete cascade,
  run_id    uuid          not null references te_reimbursement_runs (id) on delete cascade,
  report_id uuid          not null references te_expense_reports (id) on delete restrict,
  amount    numeric(18,4) not null check (amount > 0),
  created_at timestamptz  not null default now()
);
/*
 * THE payment guard. A report appears in at most one reimbursement item ever,
 * so re-running a payout batch, or two people running it at once, cannot pay
 * somebody twice. This is a database constraint rather than a check in a
 * handler because the handler is the thing that gets retried.
 */
create unique index te_reimbursement_once on te_reimbursement_items (report_id);
create index te_reimbursement_run_idx on te_reimbursement_items (run_id);
