'use client'

import { EmptyPanel, Notice, PanelHeader } from './PortalPanel'

/**
 * Sub-pages for each app portal.
 *
 * These mirror the live app, including its "no employee profile linked" state.
 * CRM and HR are full apps with their own chrome — see pages/app/crm and /hr.
 */

const noProfile = (
  <Notice title="No employee profile linked">
    Your account isn't linked to an employee record yet. Ask your HR admin to add you so you can view your profile,
    attendance, and leaves.
  </Notice>
)

export const MeOverview = () => <div className="pt-2">{noProfile}</div>

export const MeProfile = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="My Profile" blurb="Your employee record, as HR maintains it." />
    {noProfile}
  </div>
)

export const MeAttendance = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="My Attendance" blurb="Check-ins, check-outs, and regularisation requests." />
    {noProfile}
  </div>
)

export const MeLeaves = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="My Leaves" blurb="Balances, requests, and approval status." />
    {noProfile}
  </div>
)

export const MePayslips = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="My Payslips" blurb="Monthly payslips and tax statements." />
    {noProfile}
  </div>
)

export const MeTimesheets = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="My Timesheets" blurb="Logged hours by project and task." />
    {noProfile}
  </div>
)

export const MeDocuments = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="My Documents" blurb="Contracts, IDs, and anything HR has shared with you." />
    <EmptyPanel icon="📁" title="No documents yet" blurb="Documents shared with you by HR will appear here." />
  </div>
)

export const MeOnboarding = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="My Onboarding" blurb="Your joining checklist and its owners." />
    {noProfile}
  </div>
)

export const MeAnnouncements = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="Announcements" blurb="Company-wide posts from your admins." />
    <EmptyPanel icon="📣" title="Nothing announced yet" blurb="When an admin posts an announcement, it lands here." />
  </div>
)

export const MeTeamApprovals = () => (
  <div className="space-y-5 pt-2">
    <PanelHeader title="Team Approvals" blurb="Requests waiting on you as a manager." />
    <EmptyPanel icon="👥" title="No pending approvals" blurb="Leave, timesheet, and expense requests appear here." />
  </div>
)
