'use client'

import { PageHeader, EmptyState } from '../../components/PageHeader'

/**
 * Agent runs, which this deployment does not have.
 *
 * The page used to list executions read from browser state, each expanding into
 * the same six hard-coded steps — the same agent, the same tokens, the same
 * "6 credits · 3.3s" on every row, and a status that was always "success".
 * Nothing behind it existed: no agent runs, no per-step trace, no cost.
 *
 * So it says so. Two separate things are missing — an execution platform to run
 * work longer than a request, and a provider to call — and neither is something
 * a screen may stand in for. What IS real lives on Scheduled Jobs: schedules,
 * the jobs they queue, and each job's attempts.
 */
export default function Runs() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Runs"
        title="Agent runs are not available here."
        blurb="This page was built to walk a trace — which nodes fired, which tools were called, what the model returned and what it cost. Nothing in this deployment executes agents, so no such trace exists to show you."
      />

      <EmptyState
        icon="◷"
        title="Nothing executes agents on this deployment"
        blurb="Running an agent needs an execution platform for work longer than a request, and a configured AI provider. Neither is in place, so there are no runs, no traces and no per-run cost — and this page will not invent them."
        spacing="roomy"
      />

      <p className="mt-5 text-xs text-fg-muted">
        What does exist is the job queue behind your schedules.{' '}
        <a href="/app/scheduled-jobs" className="font-semibold text-accent hover:underline">
          Scheduled Jobs
        </a>{' '}
        shows every schedule with its real next occurrence, every job it has queued, and each job&apos;s attempts —
        attempt number, status, timing and the error text.
      </p>
    </div>
  )
}
