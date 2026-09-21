import GenericPortal from '../../../screens/app/GenericPortal'

/**
 * Any installed app without a purpose-built surface still gets a live page
 * rather than a dead link. Static siblings win over this segment.
 */
export default function Page() {
  return <GenericPortal />
}
