import AgentStudioWorkspace from '../../screens/studio/AgentStudio'
import { Protected } from '../../routes/Protected'

export default function Page() {
  return (
    <Protected requireOnboarding>
      <AgentStudioWorkspace />
    </Protected>
  )
}
