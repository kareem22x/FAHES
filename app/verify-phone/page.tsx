import { redirect } from 'next/navigation'
import PhoneVerificationGate from '@/components/modules/auth/phone-verification-gate'
import { getSession, postAuthPath } from '@/lib/auth'
import { maskPhone } from '@/lib/phone'
import { safeReturnPath } from '@/lib/safe-return-path'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'توثيق رقم الجوال · فاحص',
  robots: { index: false, follow: false },
}

/**
 * The one route a phone-unverified user is allowed to see.
 *
 * It is intentionally outside every gated prefix (`/inspector`, `/admin`,
 * `/dashboard`, `/requests`) so the proxy's redirect target is itself reachable —
 * otherwise the gate would redirect to a page that redirects to the gate.
 */
export default async function VerifyPhonePage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>
}) {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  const fallback = postAuthPath(session)
  if (session.phoneVerified) redirect(fallback)

  const params = await searchParams
  const raw = Array.isArray(params.redirect_url) ? params.redirect_url[0] : params.redirect_url
  const redirectTo = safeReturnPath(raw ?? null, fallback)

  return (
    <PhoneVerificationGate
      maskedPhone={maskPhone(session.phone)}
      hasPhone={session.phone !== null}
      redirectTo={redirectTo}
    />
  )
}
