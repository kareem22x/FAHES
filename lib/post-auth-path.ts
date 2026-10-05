/**
 * Where each role lands after authentication, and while switching surfaces.
 *
 * Lives in its own module — free of Clerk and `next/headers` imports — so the
 * mapping can be unit-tested in the node test environment like the rest of
 * `lib/`. `lib/auth.ts` re-exports it so the rest of the app keeps importing
 * from one place.
 *
 * Every function takes a plain subject bag rather than an `AppSession`, so the
 * dual-role case (an admin who is also holding another surface) is expressible
 * without the caller having to fabricate a session object.
 */

import { surfaceHomePath, type Surface } from '@/lib/surfaces'
import type { Role } from '@/types/domain'

/**
 * What the destination depends on.
 *
 * `inspectorView` is the older single-boolean toggle; `surface` is the
 * three-valued switch that superseded it. Both are accepted because they are
 * read by different layers — `getSession()` derives `inspectorView` from
 * `surface`, so in a live session they always agree, but callers that only ever
 * knew about the boolean keep working unchanged.
 */
export type SurfaceSubject = {
  role: Role
  inspectorView?: boolean
  surface?: Surface | null
  isVerified?: boolean
}

/**
 * The console dashboard for a role.
 *
 * `admin_pending` is not an error state: it is an authenticated administrator
 * who has not yet passed the second-factor gate, so it resolves to the gate
 * rather than to `/admin`.
 *
 * An operator standing in a surface gets that surface's workspace instead —
 * that is the whole point of the switch, and it keeps "where does pressing the
 * dashboard link take me" the same question as "which surface am I on".
 *
 * Precedence is `surface` → `inspectorView` → role. The explicit surface wins
 * because it is the operator's own choice; the boolean is the same choice
 * expressed in the older vocabulary; and the role is the fallback for every
 * account that holds no surface at all.
 */
export function dashboardPath({ role, inspectorView, surface }: SurfaceSubject): string {
  if (role === 'admin' || role === 'admin_pending') {
    if (surface) return surfaceHomePath(surface)
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
 * A held surface is carried through rather than ignored: an operator who
 * switched into a surface and then signed in again should come back to where
 * they were, not be silently bounced to the admin console.
 */
export function postAuthPath({ role, inspectorView, surface, isVerified }: SurfaceSubject): string {
  if (surface) return surfaceHomePath(surface)
  if (inspectorView) return '/inspector/dashboard'
  if (role === 'inspector') return '/inspector/dashboard'
  if (role === 'admin' || role === 'admin_pending') return dashboardPath({ role, inspectorView })
  // Customers must verify phone + national ID before reaching /account.
  if (!isVerified) return '/verify-identity'
  return '/account'
}

/**
 * Where the owner goes when leaving a surface.
 *
 * A plain owner returns to the admin console. A non-owner can never hold a
 * surface, so they get the workspace link rather than a silent promotion —
 * `/dashboard` re-routes every role to the workspace it owns.
 */
export function inspectorExitPath({ role }: SurfaceSubject): string {
  if (role === 'admin') return '/admin'
  if (role === 'admin_pending') return '/admin/gate'
  if (role === 'inspector') return '/inspector/dashboard'
  return '/dashboard'
}
