import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'تذاكر الدعم الفني · فاحص',
  robots: { index: false, follow: false },
}

/**
 * `/support` is the entry point the help centre links to; the ticket system
 * itself lives one level down at `/support/tickets`.
 *
 * Both are behind the same gate, so a bare `/support` would otherwise pass the
 * gate and then 404 — a dead end for anyone who trims the URL. Redirecting keeps
 * every spelling of the address landing on the real screen.
 *
 * `force-dynamic` matches the other alias in the codebase (`/client/profile`) and
 * keeps the redirect evaluated per request rather than baked into a prerendered
 * payload, so the destination can never go stale behind a build artifact.
 */
export default function SupportIndexPage() {
  redirect('/support/tickets')
}
