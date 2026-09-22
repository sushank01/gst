/*
 * Human resources: people, recruitment, attendance, leave and time.
 *
 * The prototype stored an employee as a loose `{name, fields}` blob and a leave
 * balance as a number it decremented in the browser. The structures here exist
 * because each one prevents a specific failure that costs somebody money or
 * their record:
 *
 *  - Employment is a HISTORY, not a current row. A promotion or a transfer
 *    appends; it does not overwrite what the person's job was in March.
 *  - Leave is deducted by a LEDGER, so an approval that runs twice cannot take
 *    the days twice, and a cancelled request gives them back with a visible
 *    entry rather than by incrementing a counter.
 *  - Attendance is derived from punches, with at most one open punch per
 *    person, so "forgot to clock out" is a visible open row rather than a
 *    silently wrong total.
 *  - A timesheet, once approved, is locked. Payroll that can be edited after
 *    approval is not evidence of anything.
 */

-- --------------------------------------------------------- org vocabulary ---
create table hr_departments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  code        text,
  parent_id   uuid        references hr_departments (id) on delete set null,
  head_employee_id uuid,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index hr_department_name_key on hr_departments (tenant_id, lower(name));

create table hr_designations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  grade       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index hr_designation_name_key on hr_designations (tenant_id, lower(name));

create table hr_locations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  timezone    text        not null default 'UTC',
  -- Which working days and holidays apply here. Shared with the support
  -- calendars: a public holiday is a public holiday.
  calendar_id uuid        references business_calendars (id) on delete set null,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index hr_location_name_key on hr_locations (tenant_id, lower(name));

-- ---------------------------------------------------------------- people ----
create table hr_employee_sequences (
  tenant_id  uuid        primary key references tenants (id) on delete cascade,
  prefix     text        not null default 'EMP',
  next_value bigint      not null default 1,
  padding    integer     not null default 4,
  updated_at timestamptz not null default now()
);

create table hr_employees (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  employee_no    text        not null,
  /*
   * The link to a platform account. Null for someone who has no login — a
   * shop-floor employee is still an employee. This column is what employee
   * self-service resolves against; the prototype's portal reported "no linked
   * profile" for everyone because nothing was ever linked.
   */
  user_id        uuid        references users (id) on delete set null,
  full_name      text        not null,
  preferred_name text,
  work_email     text,
  personal_email text,
  phone          text,
  date_of_birth  date,
  gender         text,
  -- 'probation' is a real state with a real deadline, not a tag.
  status         text        not null default 'active'
                   check (status in ('pre_joining', 'probation', 'active', 'notice', 'exited', 'suspended')),
  employment_type text       check (employment_type in ('full_time', 'part_time', 'contract', 'intern', 'consultant')),
  joined_on      date,
  confirmed_on   date,
  probation_ends_on date,
  exited_on      date,
  exit_reason    text,
  department_id  uuid        references hr_departments (id) on delete set null,
  designation_id uuid        references hr_designations (id) on delete set null,
  location_id    uuid        references hr_locations (id) on delete set null,
  manager_id     uuid        references hr_employees (id) on delete set null,
  custom_fields  jsonb       not null default '{}'::jsonb,
  archived_at    timestamptz,
  version        integer     not null default 1,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index hr_employee_no_key on hr_employees (tenant_id, lower(employee_no));
-- One employee record per platform account, so self-service cannot resolve two.
create unique index hr_employee_user_key on hr_employees (tenant_id, user_id) where user_id is not null;
create unique index hr_employee_work_email_key on hr_employees (tenant_id, lower(work_email)) where work_email is not null;
create index hr_employees_status_idx on hr_employees (tenant_id, status) where archived_at is null;
create index hr_employees_manager_idx on hr_employees (manager_id) where manager_id is not null;

alter table hr_departments
  add constraint hr_department_head_fk foreign key (head_employee_id) references hr_employees (id) on delete set null;

/*
 * What the job WAS, over time. A transfer closes the current row and opens the
 * next; nothing is overwritten, so "who did this person report to in March"
 * has an answer.
 */
create table hr_positions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  employee_id    uuid        not null references hr_employees (id) on delete cascade,
  department_id  uuid        references hr_departments (id) on delete set null,
  designation_id uuid        references hr_designations (id) on delete set null,
  location_id    uuid        references hr_locations (id) on delete set null,
  manager_id     uuid        references hr_employees (id) on delete set null,
  employment_type text,
  effective_from date        not null,
  effective_to   date,
  reason         text,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint hr_position_period check (effective_to is null or effective_to >= effective_from)
);
-- At most one open position per person: nobody holds two current jobs.
create unique index hr_position_one_open on hr_positions (employee_id) where effective_to is null;
create index hr_positions_idx on hr_positions (employee_id, effective_from desc);

create table hr_employment_events (
  id          bigserial primary key,
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  employee_id uuid        not null references hr_employees (id) on delete cascade,
  kind        text        not null,
  from_value  text,
  to_value    text,
  effective_on date,
  note        text,
  actor_user_id uuid      references users (id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index hr_employment_events_idx on hr_employment_events (employee_id, occurred_at desc);

create table hr_employee_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  employee_id uuid        not null references hr_employees (id) on delete cascade,
  file_id     uuid        not null references files (id) on delete cascade,
  kind        text        not null,
  -- Documents an employee may see in self-service versus HR-only records.
  visibility  text        not null default 'hr_only' check (visibility in ('hr_only', 'employee')),
  valid_until date,
  uploaded_by uuid        references users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index hr_employee_documents_idx on hr_employee_documents (employee_id, created_at desc);

-- ----------------------------------------------------------- recruitment ----
create table hr_requisitions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  reference      text        not null,
  title          text        not null,
  department_id  uuid        references hr_departments (id) on delete set null,
  designation_id uuid        references hr_designations (id) on delete set null,
  location_id    uuid        references hr_locations (id) on delete set null,
  openings       integer     not null default 1 check (openings > 0),
  status         text        not null default 'open'
                   check (status in ('draft', 'open', 'on_hold', 'filled', 'cancelled')),
  hiring_manager_id uuid     references hr_employees (id) on delete set null,
  target_start_on date,
  notes          text,
  version        integer     not null default 1,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index hr_requisition_reference on hr_requisitions (tenant_id, reference);

create table hr_candidates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  full_name   text        not null,
  email       text,
  phone       text,
  source      text,
  resume_file_id uuid     references files (id) on delete set null,
  created_at  timestamptz not null default now()
);
-- One candidate per email, so re-applying threads onto the same person.
create unique index hr_candidate_email_key on hr_candidates (tenant_id, lower(email)) where email is not null;

create table hr_applications (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  requisition_id uuid       not null references hr_requisitions (id) on delete cascade,
  candidate_id  uuid        not null references hr_candidates (id) on delete cascade,
  stage         text        not null default 'applied'
                  check (stage in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  rejected_reason text,
  applied_on    date        not null,
  version       integer     not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- One live application per candidate per requisition.
create unique index hr_application_key on hr_applications (requisition_id, candidate_id);
create index hr_applications_stage_idx on hr_applications (tenant_id, stage);

create table hr_interviews (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  application_id uuid        not null references hr_applications (id) on delete cascade,
  round          integer     not null default 1,
  scheduled_at   timestamptz not null,
  duration_minutes integer   not null default 60 check (duration_minutes > 0),
  mode           text,
  interviewer_employee_id uuid references hr_employees (id) on delete set null,
  outcome        text        check (outcome in ('pending', 'advance', 'hold', 'reject')),
  feedback       text,
  rating         integer     check (rating between 1 and 5),
  created_at     timestamptz not null default now()
);
create unique index hr_interview_round_key on hr_interviews (application_id, round);

create table hr_offers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  application_id uuid        not null references hr_applications (id) on delete cascade,
  designation_id uuid        references hr_designations (id) on delete set null,
  /*
   * Compensation is stored with an explicit currency and never as a formatted
   * string. A salary figure whose currency is implied is a real way to pay
   * somebody the wrong amount.
   */
  annual_ctc     numeric(18,4),
  currency       char(3),
  joining_on     date,
  status         text        not null default 'draft'
                   check (status in ('draft', 'sent', 'accepted', 'declined', 'withdrawn', 'expired')),
  expires_on     date,
  sent_at        timestamptz,
  decided_at     timestamptz,
  employee_id    uuid        references hr_employees (id) on delete set null,
  version        integer     not null default 1,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now()
);
-- One live offer per application: two accepted offers is two salaries.
create unique index hr_offer_one_live on hr_offers (application_id)
  where status in ('draft', 'sent', 'accepted');

-- ------------------------------------------------------------ attendance ----
create table hr_shifts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  name          text        not null,
  starts_minute integer     not null check (starts_minute between 0 and 1440),
  ends_minute   integer     not null check (ends_minute between 0 and 2880),
  break_minutes integer     not null default 0 check (break_minutes >= 0),
  -- Which weekdays it runs, 0 = Sunday. Empty means every day.
  weekdays      integer[]   not null default '{}',
  grace_minutes integer     not null default 0 check (grace_minutes >= 0),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  -- An overnight shift ends past midnight, which is why ends_minute may exceed
  -- 1440; it may never end before it starts.
  constraint hr_shift_ordered check (ends_minute > starts_minute)
);
create unique index hr_shift_name_key on hr_shifts (tenant_id, lower(name));

create table hr_shift_assignments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  employee_id  uuid        not null references hr_employees (id) on delete cascade,
  shift_id     uuid        not null references hr_shifts (id) on delete cascade,
  effective_from date      not null,
  effective_to date,
  created_at   timestamptz not null default now(),
  constraint hr_shift_assignment_period check (effective_to is null or effective_to >= effective_from)
);
create unique index hr_shift_assignment_one_open on hr_shift_assignments (employee_id) where effective_to is null;

/*
 * Raw clock events. At most one open punch per employee, enforced by index:
 * a second clock-in without a clock-out is refused rather than producing two
 * overlapping intervals nobody can reconcile.
 */
create table hr_attendance_punches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  employee_id uuid        not null references hr_employees (id) on delete cascade,
  punched_in_at  timestamptz not null,
  punched_out_at timestamptz,
  source      text        not null default 'web',
  in_note     text,
  out_note    text,
  created_at  timestamptz not null default now(),
  constraint hr_punch_ordered check (punched_out_at is null or punched_out_at > punched_in_at)
);
create unique index hr_punch_one_open on hr_attendance_punches (employee_id) where punched_out_at is null;
create index hr_punches_idx on hr_attendance_punches (employee_id, punched_in_at desc);

/*
 * The settled day. Derived from punches and leave rather than typed in, and
 * carrying the minutes so a report never re-derives them differently.
 */
create table hr_attendance_days (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  employee_id   uuid        not null references hr_employees (id) on delete cascade,
  attendance_on date        not null,
  status        text        not null
                  check (status in ('present', 'absent', 'weekly_off', 'holiday', 'leave', 'half_day', 'on_duty')),
  worked_minutes integer    not null default 0 check (worked_minutes >= 0),
  overtime_minutes integer  not null default 0 check (overtime_minutes >= 0),
  late_minutes  integer     not null default 0 check (late_minutes >= 0),
  shift_id      uuid        references hr_shifts (id) on delete set null,
  leave_request_id uuid,
  note          text,
  settled_at    timestamptz not null default now()
);
create unique index hr_attendance_day_key on hr_attendance_days (employee_id, attendance_on);
create index hr_attendance_days_idx on hr_attendance_days (tenant_id, attendance_on);

-- ----------------------------------------------------------------- leave ----
create table hr_leave_types (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  name           text        not null,
  code           text        not null,
  -- Days added per accrual period. Zero means "granted, never accrued".
  accrual_days   numeric(8,2) not null default 0,
  accrual_period text        not null default 'yearly' check (accrual_period in ('monthly', 'quarterly', 'yearly', 'none')),
  max_balance_days numeric(8,2),
  allow_negative boolean     not null default false,
  requires_approval boolean  not null default true,
  counts_weekends boolean    not null default false,
  counts_holidays boolean    not null default false,
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);
create unique index hr_leave_type_code_key on hr_leave_types (tenant_id, lower(code));

create table hr_leave_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  employee_id   uuid        not null references hr_employees (id) on delete cascade,
  leave_type_id uuid        not null references hr_leave_types (id) on delete restrict,
  starts_on     date        not null,
  ends_on       date        not null,
  -- Counted from the working calendar, not (ends - starts): a week off over a
  -- public holiday is not five days of leave.
  day_count     numeric(8,2) not null check (day_count > 0),
  half_day      boolean     not null default false,
  reason        text,
  status        text        not null default 'submitted'
                  check (status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'withdrawn')),
  decided_by    uuid        references users (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  version       integer     not null default 1,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint hr_leave_period check (ends_on >= starts_on)
);
create index hr_leave_requests_idx on hr_leave_requests (employee_id, starts_on desc);
create index hr_leave_requests_status_idx on hr_leave_requests (tenant_id, status);

alter table hr_attendance_days
  add constraint hr_attendance_leave_fk foreign key (leave_request_id) references hr_leave_requests (id) on delete set null;

/*
 * Every individual day a request covers. This is what makes an overlap
 * detectable and an approval countable — a start and end date alone cannot
 * express "half day on the Friday" or be intersected cheaply.
 */
create table hr_leave_request_days (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid        not null references tenants (id) on delete cascade,
  request_id uuid        not null references hr_leave_requests (id) on delete cascade,
  employee_id uuid       not null references hr_employees (id) on delete cascade,
  leave_on   date        not null,
  portion    numeric(4,2) not null default 1 check (portion > 0 and portion <= 1)
);
create unique index hr_leave_day_key on hr_leave_request_days (request_id, leave_on);
create index hr_leave_days_employee_idx on hr_leave_request_days (employee_id, leave_on);

/*
 * The balance LEDGER. Balance is a sum of entries, never a stored counter, and
 * `once_key` makes each effect happen exactly once: approving the same request
 * twice inserts one deduction, and cancelling writes a visible restoration
 * rather than adding the number back.
 */
create table hr_leave_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  employee_id   uuid        not null references hr_employees (id) on delete cascade,
  leave_type_id uuid        not null references hr_leave_types (id) on delete cascade,
  period_year   integer     not null,
  kind          text        not null check (kind in ('accrual', 'grant', 'deduction', 'restoration', 'adjustment', 'encashment', 'lapse')),
  days          numeric(8,2) not null,
  request_id    uuid        references hr_leave_requests (id) on delete set null,
  note          text,
  once_key      text        not null,
  actor_user_id uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index hr_leave_entry_once on hr_leave_entries (tenant_id, once_key);
create index hr_leave_entries_balance_idx on hr_leave_entries (employee_id, leave_type_id, period_year);

-- ------------------------------------------------- overtime and timesheets --
create table hr_overtime_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  employee_id  uuid        not null references hr_employees (id) on delete cascade,
  worked_on    date        not null,
  minutes      integer     not null check (minutes > 0 and minutes <= 1440),
  reason       text,
  status       text        not null default 'submitted'
                 check (status in ('submitted', 'approved', 'rejected', 'cancelled')),
  decided_by   uuid        references users (id) on delete set null,
  decided_at   timestamptz,
  version      integer     not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- One live overtime claim per person per day.
create unique index hr_overtime_one_live on hr_overtime_requests (employee_id, worked_on)
  where status in ('submitted', 'approved');

create table hr_timesheets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  employee_id uuid        not null references hr_employees (id) on delete cascade,
  period_start date       not null,
  period_end  date        not null,
  status      text        not null default 'draft'
                check (status in ('draft', 'submitted', 'approved', 'rejected', 'locked')),
  total_minutes integer   not null default 0 check (total_minutes >= 0),
  submitted_at timestamptz,
  decided_by  uuid        references users (id) on delete set null,
  decided_at  timestamptz,
  decision_note text,
  version     integer     not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint hr_timesheet_period check (period_end >= period_start)
);
create unique index hr_timesheet_period_key on hr_timesheets (employee_id, period_start);

create table hr_timesheet_entries (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  timesheet_id uuid        not null references hr_timesheets (id) on delete cascade,
  worked_on    date        not null,
  minutes      integer     not null check (minutes > 0 and minutes <= 1440),
  project_code text,
  task         text,
  billable     boolean     not null default false,
  note         text,
  created_at   timestamptz not null default now()
);
create index hr_timesheet_entries_idx on hr_timesheet_entries (timesheet_id, worked_on);

-- ---------------------------------------- development, care, communication --
create table hr_training_programmes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  title       text        not null,
  provider    text,
  hours       numeric(8,2),
  mandatory   boolean     not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create table hr_training_enrolments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  programme_id uuid        not null references hr_training_programmes (id) on delete cascade,
  employee_id  uuid        not null references hr_employees (id) on delete cascade,
  status       text        not null default 'enrolled'
                 check (status in ('enrolled', 'in_progress', 'completed', 'failed', 'withdrawn')),
  enrolled_on  date        not null,
  completed_on date,
  score        numeric(6,2),
  certificate_file_id uuid references files (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index hr_enrolment_key on hr_training_enrolments (programme_id, employee_id);

create table hr_appraisal_cycles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  starts_on   date        not null,
  ends_on     date        not null,
  status      text        not null default 'planned'
                check (status in ('planned', 'open', 'review', 'closed')),
  created_at  timestamptz not null default now(),
  constraint hr_appraisal_cycle_period check (ends_on >= starts_on)
);
create unique index hr_appraisal_cycle_name on hr_appraisal_cycles (tenant_id, lower(name));

create table hr_appraisals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  cycle_id     uuid        not null references hr_appraisal_cycles (id) on delete cascade,
  employee_id  uuid        not null references hr_employees (id) on delete cascade,
  reviewer_employee_id uuid references hr_employees (id) on delete set null,
  status       text        not null default 'pending'
                 check (status in ('pending', 'self_review', 'manager_review', 'calibration', 'shared', 'acknowledged')),
  self_rating  integer     check (self_rating between 1 and 5),
  manager_rating integer   check (manager_rating between 1 and 5),
  final_rating integer     check (final_rating between 1 and 5),
  summary      text,
  version      integer     not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index hr_appraisal_key on hr_appraisals (cycle_id, employee_id);

create table hr_announcements (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  title       text        not null,
  body        text        not null,
  audience    text        not null default 'all' check (audience in ('all', 'department', 'location')),
  department_id uuid      references hr_departments (id) on delete cascade,
  location_id uuid        references hr_locations (id) on delete cascade,
  published_at timestamptz,
  expires_on  date,
  created_by  uuid        references users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index hr_announcements_idx on hr_announcements (tenant_id, published_at desc);

create table hr_announcement_reads (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid     not null references hr_announcements (id) on delete cascade,
  employee_id     uuid     not null references hr_employees (id) on delete cascade,
  read_at         timestamptz not null default now()
);
create unique index hr_announcement_read_key on hr_announcement_reads (announcement_id, employee_id);

/*
 * Grievances and welfare cases. Confidentiality is the point: `raised_by` may
 * be null for an anonymous report, and visibility is explicit rather than
 * implied by who happens to hold a link.
 */
create table hr_care_cases (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  reference     text        not null,
  kind          text        not null,
  subject       text        not null,
  body          text,
  raised_by_employee_id uuid references hr_employees (id) on delete set null,
  about_employee_id uuid    references hr_employees (id) on delete set null,
  anonymous     boolean     not null default false,
  status        text        not null default 'open'
                  check (status in ('open', 'investigating', 'resolved', 'closed', 'withdrawn')),
  assigned_to_user_id uuid  references users (id) on delete set null,
  resolution    text,
  resolved_at   timestamptz,
  version       integer     not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index hr_care_case_reference on hr_care_cases (tenant_id, reference);
