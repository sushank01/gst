'use client'

import { Icon } from '../../components/Icon'
import { Link } from '../../lib/router'
import { AwaitingDecision, ElsewhereLink } from '../../components/NotBuilt'

/**
 * Client portal access control.
 *
 * There is no portal. There is no external identity model, no portal session,
 * no portal request path, and no way for somebody outside the workspace to
 * sign in at all — decision D5.
 *
 * The previous version of this page let an administrator configure tab
 * visibility, define roles with read/comment/download scopes, and read the
 * line "Changes apply on the next portal request." Every one of those settings
 * was written to the browser's own storage, and no portal request would ever
 * arrive to apply them to. The most dangerous part was the framing: somebody
 * could reasonably have believed they had restricted what a customer could
 * see, and acted on that belief.
 *
 * The workspace's own role permissions ARE real and enforced on every request,
 * so the page points there instead of leaving a dead end.
 */
export default function ClientPortal() {
  return (
    <div className="mx-auto max-w-4xl pt-2">
      <header>
        <h1 className="flex items-center gap-3 text-[24px] font-bold tracking-tight">
          <Icon name="shield" size={24} className="text-accent" />
          Client Portal Access
        </h1>
        <p className="mt-2 text-[15px] text-fg-muted">
          What people outside your workspace would be able to see, once they can sign in at all.
        </p>
      </header>

      <div className="mt-6 space-y-4">
        <AwaitingDecision
          title="There is no client portal on this deployment"
          decision="D5"
          because={
            <>
              A portal needs a way to identify somebody who is not a member of the workspace — how they are invited,
              how they authenticate, and what a portal session is allowed to reach. None of that is decided, so there
              is no portal request for any setting here to apply to.
            </>
          }
        >
          <p className="text-[13px] leading-relaxed text-fg-muted">
            This page previously let you switch tabs on and off and define portal roles with read, comment and
            download scopes. Those choices were kept in your browser and applied to nothing. They have been removed
            rather than left looking like access control, because believing you have restricted what a customer can
            see — when you have not — is worse than having no page at all.
          </p>
        </AwaitingDecision>

        <section className="flex items-start gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
          <Icon name="key" size={18} className="mt-0.5 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Permissions for people inside your workspace are real</p>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
              Roles are enforced by the server on every request, not by hiding a screen: a viewer who calls a write
              endpoint directly is refused, and a record belonging to another workspace answers as not found rather
              than as forbidden, so ids cannot be probed.
            </p>
            <p className="mt-3">
              <ElsewhereLink to="/app/account">Manage members and roles</ElsewhereLink>
            </p>
          </div>
        </section>

        <p className="text-[13px] text-fg-muted">
          Looking for the marketing pages instead? <Link to="/" className="text-accent hover:underline">Back to the site</Link>.
        </p>
      </div>
    </div>
  )
}
