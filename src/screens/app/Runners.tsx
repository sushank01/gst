'use client'

import { Icon } from '../../components/Icon'
import { AwaitingDecision, ElsewhereLink } from '../../components/NotBuilt'

/**
 * Tenant runners.
 *
 * This page used to issue a pairing token and an install command. Both were
 * fabrications of a specific and unhelpful kind: the token was generated in
 * the browser with `crypto.randomUUID()` and no server had ever seen it, the
 * install command named a binary that does not exist, and the runner's status
 * was a stored string that began at "Pending pairing" and could never change
 * because nothing ever dialled in. Somebody could have run that command on a
 * production host and spent an afternoon working out why nothing happened.
 *
 * The runner protocol — pairing, heartbeat, lease, job pull — depends on
 * decision D1, which settles where long-running work executes at all. Until
 * that exists there is nothing for a runner to connect to, so this page takes
 * no input.
 */
export default function Runners() {
  return (
    <div className="mx-auto max-w-4xl pt-2">
      <header className="max-w-3xl">
        <h1 className="flex items-center gap-3 text-[28px] font-bold tracking-tight">
          <Icon name="server" size={26} className="text-accent" />
          Tenant Runners
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
          A runner would sit inside your network and let Apragya reach firewalled on-premise systems without opening
          an inbound firewall rule.
        </p>
      </header>

      <div className="mt-6">
        <AwaitingDecision
          title="No runner can be paired on this deployment"
          decision="D1"
          because={
            <>
              Pairing a runner means issuing a credential the server will later recognise, and giving it somewhere to
              pull work from. Neither exists yet: there is no execution platform behind scheduled and long-running
              work, so a paired runner would have nothing to do and no way to prove who it was.
            </>
          }
        >
          <p className="text-[13px] leading-relaxed text-fg-muted">
            The previous version of this page issued a token generated in your browser and an install command for a
            binary that does not exist. It has been removed rather than left looking operational.
          </p>
          <p className="mt-4">
            <ElsewhereLink to="/app/scheduled-jobs">Scheduled work that does run today</ElsewhereLink>
          </p>
        </AwaitingDecision>
      </div>
    </div>
  )
}
