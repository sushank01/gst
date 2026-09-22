/**
 * HR & People Ops, transcribed from apragya.ai/apps/hr-people.
 *
 * HR navigates through a grouped side column (CRM uses a horizontal tab bar), and
 * each page composes its own toolbar — sub-tabs, stat cards, filters, and header
 * actions all vary per page, so the shape is described in data rather than assumed.
 */

/** One field in a page's dialog. */
export type HrField =
  | { kind: 'text'; label: string; required?: boolean; placeholder?: string; span?: number }
  | { kind: 'textarea'; label: string; required?: boolean; placeholder?: string }
  | { kind: 'select'; label: string; value: string; options?: readonly string[]; required?: boolean; hint?: string; span?: number }
  | { kind: 'number'; label: string; value: string; span?: number }
  | { kind: 'date'; label: string; required?: boolean; offsetDays?: number; span?: number }
  | { kind: 'checkbox'; label: string; checked?: boolean }
  | { kind: 'entries'; label: string; action: string; empty: string }

export type HrModal = { title: string; submit: string; fields: HrField[] }

export type HrSubTab = {
  label: string
  icon?: string
  empty?: string
  /** A line of explanation shown above this sub-tab's action. */
  note?: string
  action?: string
  secondaryAction?: string
  filters?: string[]
  /** A lone select where the sub-tab needs one (Skills → Coverage). */
  select?: string
  modal?: HrModal
}
export type HrStat = {
  label: string
  value: string
  /** Card treatment. */
  tone?: 'plain' | 'active' | 'done'
  /** Number colour, which varies independently of the card. */
  valueTone?: 'fg' | 'warn' | 'ok' | 'bad'
}
export type LegendEntry = { label: string; tone: string }

export type HrPage = {
  /** Also the `?tab=` slug, matching the live app's URLs. */
  id: string
  icon: string
  label: string
  title: string
  blurb: string
  /** Buttons aligned to the right of the title. */
  headerActions?: { label: string; primary?: boolean }[]
  subTabs?: HrSubTab[]
  /** Shifts uses underlined tabs; most pages use pills. */
  subTabStyle?: 'pill' | 'underline'
  stats?: HrStat[]
  /** A helper link above the filter row (Leaves). */
  link?: string
  /** Chip filters rather than selects (Leaves). */
  chips?: string[]
  chipsAction?: string
  /** From / To / employee filter card with an export (Overtime report). */
  dateFilterCard?: { from: string; to: string; select: string; export: string }
  /** Two metrics shown side by side in one card (Overtime report). */
  metrics?: { label: string; value: string }[]
  /** Full attendance calendar with its own legend (Attendance calendar). */
  calendar?: { note: string; select: string; legend: LegendEntry[] }
  /** A pill group above the title, switching mode rather than view (Performance). */
  modeTabs?: { label: string; icon?: string }[]
  /** Amber callout with its own action (Performance). */
  notice?: { text: string; action: string }
  /** Dialog opened by the page's primary action. */
  modal?: HrModal
  search?: string
  filters?: string[]
  dateRange?: string
  viewToggle?: boolean
  /** A full-width select below the filter row. */
  wideSelect?: string
  count?: string
  action?: string
  emptyIcon?: string
  emptyTitle?: string
  empty: string
}

export type HrGroup = { id: string; label: string; items: HrPage[] }

export const hrGroups: HrGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        id: 'dashboard',
        icon: '▦',
        label: 'Dashboard',
        title: 'Dashboard',
        blurb: 'Headcount, joiners, leavers, and everything waiting on People Ops today.',
        empty: 'No employee records yet.',
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      {
        id: 'recruitment',
        icon: '👤',
        label: 'Recruitment',
        title: 'Recruitment',
        blurb: 'Openings, applicants, interviews, and referrals — end-to-end hiring in one place.',
        subTabs: [
          { label: 'Openings', empty: 'No openings yet. Create one from scratch or against a staffing plan.' },
          { label: 'Applicants', empty: 'No applicants yet.' },
          { label: 'Interviews', empty: 'No interviews scheduled.' },
          { label: 'Referrals', empty: 'No referrals yet.' },
          { label: 'Staffing plans', empty: 'No staffing plans yet.' },
        ],
        filters: ['All statuses'],
        action: '+ New opening',
        empty: 'No openings yet. Create one from scratch or against a staffing plan.',
      },
      {
        id: 'offers',
        icon: '✉',
        label: 'Offers & letters',
        title: 'Offers & letters',
        blurb: 'Job offers, appointment letters, and reusable letter templates.',
        subTabs: [
          { label: 'Offers', empty: 'No job offers yet.' },
          { label: 'Letters', empty: 'No letters yet.' },
          { label: 'Letter templates', empty: 'No letter templates yet.' },
        ],
        filters: ['All statuses'],
        action: '+ New offer',
        empty: 'No job offers yet.',
      },
      {
        id: 'onboarding',
        icon: '👤',
        label: 'Onboarding',
        title: 'Onboarding',
        blurb: 'Reusable checklists + per-employee runs.',
        subTabs: [
          { label: 'Runs', empty: 'No onboarding runs yet. Start one to materialize a template for an employee.' },
          { label: 'Templates', empty: 'No onboarding templates yet.' },
        ],
        stats: [
          { label: 'Pending', value: '0' },
          { label: 'In progress', value: '0', tone: 'active' },
          { label: 'Completed', value: '0', tone: 'done' },
          { label: 'Overdue', value: '0' },
        ],
        filters: ['All statuses'],
        action: '+ New onboarding',
        empty: 'No onboarding runs yet. Start one to materialize a template for an employee.',
      },
      {
        id: 'employees',
        icon: '👥',
        label: 'Employees',
        title: 'Employees',
        blurb: 'Directory of everyone in the organisation. Click a row for details.',
        headerActions: [
          { label: '✉ Invite pending' },
          { label: '⤒ Bulk hire (CSV)' },
          { label: '+ Add employee', primary: true },
        ],
        search: 'Search by name, email, employee ID',
        filters: ['All departments', 'All designations', 'All types', 'Any status'],
        dateRange: 'Joined',
        viewToggle: true,
        emptyIcon: '👥',
        emptyTitle: 'No employees yet',
        empty: 'Add employees to start managing your team.',
      },
      {
        id: 'lifecycle_changes',
        icon: '⇄',
        label: 'Lifecycle changes',
        title: 'Lifecycle changes',
        blurb: 'Promotions and transfers with before / after tracking.',
        subTabs: [
          { label: 'Promotions', icon: '📈', empty: 'No promotions yet.' },
          { label: 'Transfers', icon: '👥', empty: 'No transfers yet.' },
        ],
        filters: ['All statuses'],
        wideSelect: 'All employees',
        action: '+ New promotion',
        empty: 'No promotions yet.',
      },
      {
        id: 'documents',
        icon: '📄',
        label: 'Documents',
        title: 'Documents',
        blurb:
          'HR-uploaded employee documents — contracts, IDs, certifications, etc. Expired dates are highlighted; click Download to open the file.',
        headerActions: [{ label: '+ Add document', primary: true }],
        filters: ['All employees'],
        count: '0 documents',
        emptyIcon: '📄',
        empty: 'No employee documents yet.',
      },
      {
        id: 'separation',
        icon: '👤',
        label: 'Separation',
        title: 'Separation',
        blurb: 'Resignations, exits, clearances, and full-and-final settlements.',
        subTabs: [
          { label: 'In progress', empty: 'No separations in progress.' },
          { label: 'Cleared', empty: 'Nothing cleared yet.' },
          { label: 'Settled', empty: 'No settlements yet.' },
        ],
        filters: ['All statuses'],
        action: '+ Initiate exit',
        empty: 'No separations in progress.',
      },
    ],
  },
  {
    id: 'time',
    label: 'Time & Attendance',
    items: [
      {
        id: 'shifts',
        icon: '▤',
        label: 'Shifts',
        title: 'Shifts & Rosters',
        blurb: 'Define work shifts and assign them to employees. Drives attendance schedules and roster planning.',
        headerActions: [{ label: '+ New shift', primary: true }],
        subTabStyle: 'underline',
        subTabs: [
          { label: 'Definitions', icon: '🕐', empty: 'No shifts defined yet. Click New shift to add your first one.' },
          { label: 'Assignments', icon: '👥', empty: 'No shift assignments yet.' },
        ],
        empty: 'No shifts defined yet. Click New shift to add your first one.',
      },
      {
        id: 'attendance',
        icon: '🕐',
        label: 'Attendance',
        title: 'Attendance',
        blurb: 'Daily check-ins and check-outs across the org.',
        filters: ['All departments', 'Any status'],
        empty: 'No attendance records yet.',
      },
      {
        id: 'attendance_calendar',
        icon: '▦',
        label: 'Attendance calendar',
        title: 'Attendance calendar',
        blurb: '',
        calendar: {
          note: 'Who actually worked — attendance recorded per day, including work from home, absences and unpaid days. For who is booked off, use Leaves → Calendar.',
          select: 'Everyone — or pick an employee',
          legend: [
            { label: 'Present', tone: 'bg-emerald-600' },
            { label: 'Work from home', tone: 'bg-amber-500' },
            { label: 'Paid leave', tone: 'bg-teal-500' },
            { label: 'Loss of pay', tone: 'bg-red-800' },
            { label: 'Half day', tone: 'bg-amber-300' },
            { label: 'Short hours', tone: 'bg-slate-300' },
            { label: 'Absent', tone: 'bg-rose-800' },
            { label: 'Late', tone: 'bg-amber-400' },
            { label: 'Holiday', tone: 'bg-slate-800' },
            { label: 'Weekend', tone: 'bg-sky-200' },
          ],
        },
        empty: '',
      },
      {
        id: 'attendance_admin',
        icon: '▤',
        label: 'Attendance admin',
        title: 'Attendance admin',
        blurb: 'Review attendance corrections, bulk-mark attendance, and choose who may approve or reject corrections.',
        subTabs: [
          { label: 'Regularizations', empty: 'No regularization requests.' },
          { label: 'Bulk mark', empty: 'Nothing bulk-marked yet.' },
          { label: 'Approvers', empty: 'No approvers configured yet.' },
        ],
        stats: [
          { label: 'All requests', value: '0' },
          { label: 'Pending', value: '0', tone: 'active', valueTone: 'warn' },
          { label: 'Approved', value: '0', valueTone: 'ok' },
          { label: 'Rejected', value: '0', valueTone: 'bad' },
          { label: 'Decided by you', value: '0 ✓ · 0 ✕' },
        ],
        filters: ['Pending'],
        action: '+ New request',
        empty: 'No regularization requests.',
      },
      {
        id: 'leaves',
        icon: '▦',
        label: 'Leaves',
        title: 'Leaves',
        blurb: 'Requests, leave-type library, fiscal periods, and blackout lists.',
        subTabs: [
          { label: 'Requests', empty: 'No leave requests' },
          { label: 'Allocations', empty: 'No allocations yet' },
          { label: 'Encashments', empty: 'No encashments yet' },
          { label: 'Comp-off', empty: 'No comp-off entries yet' },
          { label: 'Policies', empty: 'No leave policies yet' },
          { label: 'Types', empty: 'No leave types yet' },
          { label: 'Periods & Accrual', empty: 'No fiscal periods configured yet' },
          { label: 'Holidays', empty: 'No holidays configured yet' },
          { label: 'Block lists', empty: 'No blackout lists yet' },
        ],
        link: 'Looking for your own leave balance? Open My Leaves →',
        chips: ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled', 'Awaiting HR', '🗓 Any dates'],
        chipsAction: '+ Request Leave',
        emptyIcon: '▦',
        empty: '',
      },
      {
        id: 'team_approvals',
        icon: '🛡',
        label: 'Team approvals',
        title: '',
        blurb: '',
        empty: 'No employee profile linked.',
      },
      {
        id: 'overtime',
        icon: '◷',
        label: 'Overtime',
        title: 'Overtime',
        blurb:
          'HR-side tracking — employees log hours, managers approve. Payroll picks up approved requests and converts them to payslip lines via Payroll → Overtime.',
        headerActions: [{ label: '+ Log overtime', primary: true }],
        filters: ['All statuses'],
        empty: 'No overtime logged. Employees log hours here for manager approval.',
      },
      {
        id: 'overtime_report',
        icon: '◷',
        label: 'Overtime report',
        title: 'Overtime report',
        blurb:
          "Days where clocked time exceeded the org's standard hours. Computed live from attendance — no submission needed.",
        dateFilterCard: { from: 'From', to: 'To', select: 'All employees', export: '⤓ Export CSV' },
        metrics: [
          { label: 'Days with OT', value: '0' },
          { label: 'Total OT in range', value: '0m' },
        ],
        empty:
          "No overtime in this range. Days appear here when the day's clocked total exceeds the org's standard work hours.",
      },
      {
        id: 'timesheets',
        icon: '▤',
        label: 'Timesheets',
        title: 'Timesheets',
        blurb:
          'Period-based hours log. Employees enter daily/per-task hours, managers approve, and Payroll consumes approved timesheets when processing a run whose period overlaps.',
        headerActions: [{ label: '+ New timesheet', primary: true }],
        filters: ['All statuses'],
        modal: {
          title: 'New timesheet',
          submit: 'Create',
          fields: [
            { kind: 'select', label: 'Employee', value: 'Select...', required: true },
            { kind: 'date', label: 'Period start', required: true, offsetDays: -30 },
            { kind: 'date', label: 'Period end', required: true },
            { kind: 'entries', label: 'Entries', action: '+ Add entry', empty: 'No entries. Add one per day or per task.' },
            { kind: 'textarea', label: 'Notes' },
          ],
        },
        empty: 'No timesheets yet.',
      },
    ],
  },
  {
    id: 'development',
    label: 'Development',
    items: [
      {
        id: 'performance',
        icon: '◎',
        label: 'Performance',
        title: 'Performance',
        blurb: 'Your own review and the reviews other people are waiting on you for.',
        modeTabs: [
          { label: 'My performance', icon: '☆' },
          { label: 'Setup', icon: '⚙' },
        ],
        subTabStyle: 'underline',
        subTabs: [
          { label: 'My review', icon: '☆' },
          { label: 'Reviews I give', icon: '✉' },
        ],
        notice: {
          text: "You don't have an employee record yet. HR can set one up for you, or you can create a minimal record now to unblock yourself — HR will enrich the details (department, designation, salary) later.",
          action: '+ Create my employee record',
        },
        empty: '',
      },
      {
        id: 'training',
        icon: '🎓',
        label: 'Training',
        title: 'Training',
        blurb:
          'Course catalog and employee enrollments. Track enrollment → completion with score, grade, and certificate link.',
        subTabs: [
          {
            label: 'Programs',
            note: 'Catalog of courses employees can enroll in. Codes are referenced by enrollments — rename with care.',
            action: '+ New program',
            empty: 'No training programs yet.',
            modal: {
              title: 'New training program',
              submit: 'Create',
              fields: [
                { kind: 'text', label: 'Code', required: true, placeholder: 'E.G. PYTHON_101' },
                { kind: 'text', label: 'Category', placeholder: 'technical / compliance / leadership' },
                { kind: 'select', label: 'Delivery', value: 'self_paced' },
                { kind: 'text', label: 'Title', required: true, span: 3 },
                { kind: 'textarea', label: 'Description' },
                { kind: 'number', label: 'Duration (hours)', value: '0' },
                { kind: 'number', label: 'Cost', value: '0' },
                { kind: 'select', label: 'Currency', value: '₹ INR - Indian Rupee' },
                { kind: 'text', label: 'Provider', placeholder: 'Coursera, Udemy, internal...', span: 2 },
                { kind: 'number', label: 'Max participants (0 = unlimited)', value: '0' },
                { kind: 'textarea', label: 'Prerequisites' },
                { kind: 'checkbox', label: 'Certification offered' },
                { kind: 'checkbox', label: 'Active', checked: true },
              ],
            },
          },
          {
            label: 'Enrollments',
            note: 'Who is enrolled, and how far along they are.',
            action: '+ New enrollment',
            empty: 'No enrollments yet.',
          },
        ],
        empty: 'No training programs yet.',
      },
      {
        id: 'skills',
        icon: '★',
        label: 'Skills',
        title: 'Skills',
        blurb:
          'Skill library and per-employee proficiency ratings (1–5). Helps with staffing, learning plans, and succession.',
        subTabs: [
          {
            label: 'Library',
            note: 'Codes are referenced by employee-skill records — renames propagate to the snapshot name on those rows automatically.',
            action: '+ New skill',
            empty: 'No skills yet.',
            modal: {
              title: 'New skill',
              submit: 'Create',
              fields: [
                { kind: 'text', label: 'Code', required: true, placeholder: 'E.G. PYTHON' },
                { kind: 'text', label: 'Category', placeholder: 'language / framework / domain' },
                { kind: 'text', label: 'Name', required: true, span: 2 },
                { kind: 'textarea', label: 'Description' },
                { kind: 'checkbox', label: 'Technical', checked: true },
                { kind: 'checkbox', label: 'Active', checked: true },
              ],
            },
          },
          {
            label: 'Employee skills',
            filters: ['Any level', 'All skills'],
            secondaryAction: '⤒ Bulk import',
            action: '+ Add employee skill',
            empty: 'No employee skills recorded.',
          },
          {
            label: 'Coverage',
            select: 'Pick a skill...',
            empty: 'Select a skill to see coverage by proficiency level.',
          },
        ],
        empty: 'No skills yet.',
      },
    ],
  },
  {
    id: 'care',
    label: 'Care',
    items: [
      {
        id: 'care',
        icon: '🛡',
        label: 'Employee care',
        title: 'Employee care',
        blurb: 'Grievance workflow and health-insurance enrollment.',
        subTabs: [
          {
            label: 'Grievances',
            icon: '⚑',
            filters: ['All statuses', 'All severity'],
            action: '+ File grievance',
            empty: 'No grievances filed.',
            modal: {
              title: 'File a grievance',
              submit: 'File',
              fields: [
                { kind: 'select', label: 'Employee', value: 'Select...', required: true, span: 2 },
                { kind: 'text', label: 'Category', placeholder: 'harassment / pay / facilities' },
                { kind: 'select', label: 'Severity', value: 'medium' },
                { kind: 'text', label: 'Subject', required: true, span: 2 },
                { kind: 'textarea', label: 'Description' },
                { kind: 'checkbox', label: 'File anonymously' },
              ],
            },
          },
          {
            label: 'Health insurance',
            icon: '♡',
            filters: ['All statuses'],
            action: '+ Enroll employee',
            empty: 'No health-insurance enrollments yet.',
          },
        ],
        empty: 'No grievances filed.',
      },
      {
        id: 'announcements',
        icon: '📣',
        label: 'Announcements',
        title: 'Announcements',
        blurb: '',
        headerActions: [{ label: '+ New Announcement', primary: true }],
        emptyIcon: '📣',
        emptyTitle: 'No announcements',
        empty: 'Post an announcement to keep your team informed',
        modal: {
          title: 'New Announcement',
          submit: 'Publish',
          fields: [
            { kind: 'text', label: 'Title', required: true, placeholder: 'Company offsite announcement', span: 2 },
            { kind: 'textarea', label: 'Content', required: true, placeholder: 'Write your announcement...' },
            {
              kind: 'select',
              label: 'Category',
              value: '— select —',
              hint: 'No categories configured yet — add them in Settings → Announcement Categories.',
            },
            {
              kind: 'select',
              label: 'Audience',
              value: 'Whole organization',
              hint: 'No departments configured yet — add them in Settings → Departments to scope announcements.',
            },
            { kind: 'checkbox', label: 'Pin to top — keeps it above newer announcements' },
          ],
        },
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      {
        id: 'settings',
        icon: '⚙',
        label: 'Settings',
        title: 'Settings',
        blurb: 'Departments, designations, policies, and the agents bound to this app.',
        empty: 'Nothing configured yet.',
      },
    ],
  },
]

export const hrPages = hrGroups.flatMap((group) => group.items)
export const hrPageById = new Map(hrPages.map((page) => [page.id, page]))

/**
 * HR → Settings is a flat list of tenant taxonomies, each a small list editor.
 * Interview Rounds is transcribed from the live app; the rest follow its pattern.
 */
export type HrSetting = {
  /** Also the `settings_tab=` slug. */
  id: string
  icon: string
  label: string
  title: string
  blurb: string
  /** `list` shows the add row; `panel` is a settings surface rather than a taxonomy. */
  kind: 'list' | 'panel'
  addPlaceholder?: string
}

export const hrSettings: HrSetting[] = [
  {
    id: 'general',
    icon: '⚙',
    label: 'General',
    title: 'General',
    blurb: 'Working hours, week start, fiscal year, and the defaults every other HR page inherits.',
    kind: 'panel',
  },
  {
    id: 'departments',
    icon: '🏢',
    label: 'Departments',
    title: 'Departments',
    blurb: 'The org units employees belong to. Used to scope announcements, approvals, and reporting.',
    kind: 'list',
    addPlaceholder: 'Add new department...',
  },
  {
    id: 'designations',
    icon: '💼',
    label: 'Designations',
    title: 'Designations',
    blurb: 'Job titles available when hiring or promoting. Referenced by offers and lifecycle changes.',
    kind: 'list',
    addPlaceholder: 'Add new designation...',
  },
  {
    id: 'locations',
    icon: '📍',
    label: 'Locations',
    title: 'Locations',
    blurb: 'Offices and sites. Drives holiday calendars, attendance rules, and payroll statutory defaults.',
    kind: 'list',
    addPlaceholder: 'Add new location...',
  },
  {
    id: 'work_modes',
    icon: '💼',
    label: 'Work Modes',
    title: 'Work Modes',
    blurb: 'On-site, hybrid, remote — how an employee works, recorded on their record and on attendance.',
    kind: 'list',
    addPlaceholder: 'Add new work mode...',
  },
  {
    id: 'leave_types',
    icon: '🗓',
    label: 'Leave Types',
    title: 'Leave Types',
    blurb: 'The leave library employees request against. Each type carries its own accrual and approval rules.',
    kind: 'list',
    addPlaceholder: 'Add new leave type...',
  },
  {
    id: 'employment_types',
    icon: '👥',
    label: 'Employment Types',
    title: 'Employment Types',
    blurb: 'Full-time, contract, intern, consultant — used by payroll and by statutory reporting.',
    kind: 'list',
    addPlaceholder: 'Add new employment type...',
  },
  {
    id: 'bands',
    icon: '▤',
    label: 'Bands',
    title: 'Bands',
    blurb: 'Compensation and seniority bands. Travel policy and approval chains key off these.',
    kind: 'list',
    addPlaceholder: 'Add new band...',
  },
  {
    id: 'attendance_statuses',
    icon: '🕐',
    label: 'Attendance Statuses',
    title: 'Attendance Statuses',
    blurb: 'The statuses a day can carry — present, work from home, half day, absent — and their colours.',
    kind: 'list',
    addPlaceholder: 'Add new attendance status...',
  },
  {
    id: 'alternate_saturdays',
    icon: '🗓',
    label: 'Alternate Saturdays',
    title: 'Alternate Saturdays',
    blurb: 'Which Saturdays are working days. Feeds the attendance calendar and overtime calculations.',
    kind: 'list',
    addPlaceholder: 'Add new alternate Saturday rule...',
  },
  {
    id: 'recruitment_stages',
    icon: '💼',
    label: 'Recruitment Stages',
    title: 'Recruitment Stages',
    blurb: 'The pipeline an applicant moves through, from applied to hired.',
    kind: 'list',
    addPlaceholder: 'Add new recruitment stage...',
  },
  {
    id: 'applicant_sources',
    icon: '👥',
    label: 'Applicant Sources',
    title: 'Applicant Sources',
    blurb: 'Where applicants come from — job boards, referrals, agencies — for source-of-hire reporting.',
    kind: 'list',
    addPlaceholder: 'Add new applicant source...',
  },
  {
    id: 'interview_rounds',
    icon: '🗓',
    label: 'Interview Rounds',
    title: 'Interview Rounds',
    blurb:
      "Rounds you can schedule an interview for. Narrower than Recruitment Stages: completing a round writes its name into the applicant's stage, so every round here should also exist there.",
    kind: 'list',
    addPlaceholder: 'Add new interview round...',
  },
  {
    id: 'announcement_categories',
    icon: '📣',
    label: 'Announcement Categories',
    title: 'Announcement Categories',
    blurb: 'Categories available when posting an announcement.',
    kind: 'list',
    addPlaceholder: 'Add new announcement category...',
  },
  {
    id: 'leave_approvals',
    icon: '🗓',
    label: 'Leave Approvals',
    title: 'Leave Approvals',
    blurb: 'Who approves leave, and in what order. Falls back to the reporting manager when unset.',
    kind: 'list',
    addPlaceholder: 'Add new approval rule...',
  },
  {
    id: 'email_branding',
    icon: '✉',
    label: 'Email Branding',
    title: 'Email Branding',
    blurb: 'Logo, colours, and footer applied to every email this app sends — offers, invites, notifications.',
    kind: 'panel',
  },
  {
    id: 'integrations',
    icon: '🔗',
    label: 'Integrations',
    title: 'Integrations',
    blurb: 'Connect payroll, identity, and job boards. Governed by the same RBAC and audit stack as everything else.',
    kind: 'panel',
  },
  {
    id: 'custom_fields',
    icon: '⚙',
    label: 'Custom Fields',
    title: 'Custom Fields',
    blurb: 'Extra fields on employee, applicant, and leave records — no developer required.',
    kind: 'list',
    addPlaceholder: 'Add new custom field...',
  },
  {
    id: 'ai_agents',
    icon: '🤖',
    label: 'AI Agents',
    title: 'AI Agents',
    blurb: 'The agents bound to this app, their triggers, and the guardrails the runtime enforces on them.',
    kind: 'panel',
  },
  {
    id: 'customizations',
    icon: '▤',
    label: 'Customizations',
    title: 'Customizations',
    blurb: 'Rename labels, reorder fields, and hide what your tenant does not use.',
    kind: 'panel',
  },
  {
    id: 'change_history',
    icon: '🕐',
    label: 'Change History',
    title: 'Change History',
    blurb: 'Every configuration change — who, what, when, before, after.',
    kind: 'panel',
  },
]

export const hrSettingById = new Map(hrSettings.map((setting) => [setting.id, setting]))
