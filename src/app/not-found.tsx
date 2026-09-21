import { redirect } from 'next/navigation'

/** Unknown URLs went to the landing page under the SPA router; they still do. */
export default function NotFound() {
  redirect('/')
}
