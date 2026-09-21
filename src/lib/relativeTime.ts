/** "about 1 hour ago" — the phrasing the product uses on notification rows. */
export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000)

  if (seconds < 45) return 'just now'
  if (seconds < 90) return 'about a minute ago'

  const minutes = Math.round(seconds / 60)
  if (minutes < 45) return `${minutes} minutes ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `about ${hours === 1 ? '1 hour' : `${hours} hours`} ago`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days === 1 ? '1 day' : `${days} days`} ago`

  const months = Math.round(days / 30)
  return `${months === 1 ? '1 month' : `${months} months`} ago`
}
