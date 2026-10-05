/**
 * Where each role lands after authentication, and while switching surfaces.
 *
 * Lives in its own module — free of Clerk and `next/headers` imports — so the
 * mapping can be unit-tested in the node test environment like the rest of
 * `lib/`. `lib/auth.ts` re-exports it so the rest of the app keeps importing
 * from one place.
 *
 * Every function takes a plain subject bag rather than an `AppSession`, so the
 * dual-role case (an admin who is also holding the inspector surface) is
 * expressible without the caller having to fabricate a session object.
 */

import type { Role } from '@/types/domain'

/** What the destination depends on. `inspectorView` is the owner toggle. */
export type SurfaceSubject = {
  role: Role
  inspectorView?: boolean
  isVerified?: boolean
}

/**
 * The console dashboard for a role.
 *
 * `admin_pending` is not an error state: it is an authenticated administrator
 * who has not yet passed the second-factor gate, so it resolves to the gate
 * rather than to `/admin`.
 *
 * An admin holding inspector view mode gets the inspector console instead —
 * that is the whole point of the toggle, and it keeps "where does pressing the
 * dashboard link take me" the same question as "which surface am I on".
 */
export function dashboardPath({ role, inspectorView }: SurfaceSubject): string {
  if (role === 'admin' || role === 'admin_pending') {
    if (inspectorView) return '/inspector/dashboard'
    return role === 'admin' ? '/admin' : '/admin/gate'
  }
  if (role === 'inspector') return '/inspector/dashboard'
  return '/dashboard'
}

/**
 * Where a user is sent immediately after signing in.
 *
 * Deliberately *not* just `dashboardPath()`.
 *
 * A customer's post-sign-in page is `/account` (the profile page), whereas
 * `/dashboard` — which is what `dashboardPath` returns for a customer — is the
 * full customer workspace that a booking confirmation links into. They are
 * different screens with different entry points, so the two are kept explicit
 * here rather than collapsed into one mapping.
 *
 * An inspector, by contrast, must land on their own console: the field/office
 * dashboard is their entire product surface, and dropping them on the customer
 * profile page is how an approved inspector concludes their account is broken.
 *
 * `inspectorView` is carried through rather than ignored: an owner who switched
 * into the inspector surface and then signed in again should come back to where
 * they were, not be silently bounced to the admin console.
 */
export function postAuthPath({ role, inspectorView, isVerified }: SurfaceSubject): string {
  if (inspectorView) return '/inspector/dashboard'
  if (role === 'inspector') return '/inspector/dashboard'
  if (role === 'admin' || role === 'admin_pending') return dashboardPath({ role, inspectorView })
  // Customers must verify phone + national ID before reaching /account.
  if (!isVerified) return '/verify-identity'
  return '/account'
}

/**
 * Where the owner goes when leaving inspector view mode.
 *
 * A plain owner returns to the admin console. A non-owner can never hold the
 * view flag, so they get the inspector workspace link rather than a silent
 * promotion — `/dashboard` re-routes every role to the workspace it owns.
 */
export function inspectorExitPath({ role }: SurfaceSubject): string {
  if (role === 'admin') return '/admin'
  if (role === 'admin_pending') return '/admin/gate'
  if (role === 'inspector') return '/inspector/dashboard'
  return '/dashboard'
}
