import { redirect } from 'next/navigation'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { safeReturnPath } from '@/lib/safe-return-path'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const returnPath = safeReturnPath(next)

  // Already signed in? Go straight where the visitor was headed.
  //
  // Without this short-circuit the header's "تسجيل الدخول" link ping-pongs
  // forever: /login → /sign-in → (Clerk sees an active session) → fallback
  // redirect → /login … leaving the signed-in user unable to reach anything.
  const { userId } = await clerkAuth()
  if (userId) redirect(returnPath)

  redirect(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`)
}
