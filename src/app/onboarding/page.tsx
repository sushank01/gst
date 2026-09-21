import { Suspense } from 'react'
import Onboarding from '../../screens/Onboarding'
import { Protected } from '../../routes/Protected'

export default function Page() {
  return (
    <Protected>
      <Suspense>
        <Onboarding />
      </Suspense>
    </Protected>
  )
}
