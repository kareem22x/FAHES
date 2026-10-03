import InspectorDeviceGuard from '@/components/modules/inspector/device-guard'
import { getSession } from '@/lib/auth'
import { isPlatformOwner } from '@/lib/identity-predicates'

/**
 * Device lock for the inspector workspace. Scoped to `/inspector/dashboard/*`
 * so the verification screen itself is never gated by the lock it creates.
 *
 * ── Why ownership is checked here rather than `session.inspectorView` ───────
 *
 * The first version of this file passed `isOwnerInspectorView(session)`, which
 * is true only when the owner has *already* switched into inspector view — i.e.
 * only when the `fahes_inspector_view` cookie exists, and that cookie is created
 * by pressing the toggle inside `/admin`.
 * That produced a contradiction the owner hits immediately if they open the
 * dashboard by URL instead of through the toggle:
 *
 *   * `app/inspector/layout.tsx` runs `requireRoles(['inspector'])`, which has an
 *     owner bypass — so the page is **admitted**;
 *   * this layout then computed `ownerView = false` (no cookie yet), so the guard
 *     ran, POSTed as a desktop client, took the 403, and rendered
 *     «هذا الجهاز غير مصرّح».
 *
 * A page that admits you while its own guard turns you away is simply broken.
 * The two checks were reading two different definitions of "owner": the page
 * guard used platform ownership; the device guard used "owner *in view mode*".
 *
 * The correct predicate for a *device lock* is platform ownership. The lock
 * exists to bind one inspector's account to one phone so inspectors cannot work
 * as each other; a platform owner is not part of that roster on any surface, and
 * the server route already answers `verified` for them
 * (`isPlatformOwnerSession` in `app/api/inspectors/device/route.ts`).
 *
 * Using `isPlatformOwner` also makes the guard independent of surface state: it
 * is true whether the owner arrived via the toggle or by URL, and it stays false
 * for every real inspector so their lock is untouched.
 */
export default async function InspectorDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  const isOwner = isPlatformOwner({
    phone: session?.phone,
    clerkUserId: session?.clerkUserId,
  })

  return <InspectorDeviceGuard ownerView={isOwner}>{children}</InspectorDeviceGuard>
}
