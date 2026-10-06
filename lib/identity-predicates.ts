/**
 * Environment-listed identity predicates — pure, and free of `server-only`.
 *
 * These read nothing but `process.env`, so they belong in a neutral module
 * rather than in `lib/user-store.ts`: the store imports the Supabase admin
 * client and is marked `server-only`, which makes anything it exports
 * unimportable from a unit test and from a Client Component. The owner check in
 * particular is needed in both places.
 *
 * `lib/user-store.ts` re-exports every function here, so existing imports from
 * the store keep working.
 */

import { normalizePhone } from '@/lib/phone'

/** Clerk user IDs that carry the admin role. */
export function adminClerkIds(): string[] {
  return (process.env.ADMIN_CLERK_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function adminPhones(): string[] {
  return (process.env.ADMIN_PHONES || '')
    .split(',')
    .map((item) => normalizePhone(item))
    .filter(Boolean)
}

export function ownerClerkIds(): string[] {
  return (process.env.ADMIN_OWNER_CLERK_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function ownerPhones(): string[] {
  return (process.env.ADMIN_OWNER_PHONES || '')
    .split(',')
    .map((item) => normalizePhone(item))
    .filter(Boolean)
}

export function isAdminPhone(phone: string | null | undefined) {
  return Boolean(phone && adminPhones().includes(normalizePhone(phone)))
}

export function isAdminClerkId(clerkUserId: string | null | undefined) {
  return Boolean(clerkUserId && adminClerkIds().includes(clerkUserId))
}

export function isOwnerPhone(phone: string | null | undefined) {
  return Boolean(phone && ownerPhones().includes(normalizePhone(phone)))
}

export function isOwnerClerkId(clerkUserId: string | null | undefined) {
  return Boolean(clerkUserId && ownerClerkIds().includes(clerkUserId))
}

/**
 * Site owner by verified phone number *or* by Clerk user ID. Owners are a
 * superset of admins: they skip the access-code gate and can open everything.
 *
 * The Clerk-ID arm is not a convenience. The account this was written for signs
 * in with an email address only and therefore has **no phone number at all** —
 * a phone-only owner check would fail for exactly the person it was meant to
 * recognise, while every phone-based test in the suite still passed.
 */
export function isPlatformOwner(identity: {
  phone?: string | null
  clerkUserId?: string | null
}) {
  return isOwnerPhone(identity.phone) || isOwnerClerkId(identity.clerkUserId)
}

/** Platform admin by verified phone number *or* by Clerk user ID. Owners count as admins. */
export function isPlatformAdmin(identity: {
  phone?: string | null
  clerkUserId?: string | null
}) {
  return isPlatformOwner(identity) || isAdminPhone(identity.phone) || isAdminClerkId(identity.clerkUserId)
}

/**
 * A stored user row that carries the inspector *line of business*.
 *
 * Note the deliberate absence of a `role === 'inspector'` clause. The stored
 * `role` column and `inspector_status` drift apart in one real, reachable case:
 * a platform owner who is later promoted from `inspector` to `admin`. The
 * promotion writes only `role`, so the account keeps
 * `inspector_status = 'approved'` while `role` becomes `admin` — it is an
 * approved inspector that no longer says so in `role`. Testing `role` would lock
 * that account out of its own inspector tooling.
 *
 * What actually gates the inspector surface is `inspector_status`, which is
 * written by the approval workflow (`setInspectorStatus`) and is the value the
 * field RPCs check server-side. So this reads the status alone.
 *
 * This still excludes a plain owner in inspector view mode, whose status is
 * `'none'` — correctly, because they have no approved coverage and no line of
 * business to send offers with.
 */
export function isApprovedInspector(user: { inspectorStatus?: string | null } | null | undefined): boolean {
  return user?.inspectorStatus === 'approved'
}

/**
 * Whether an account has cleared the phone-verification wall — or is exempt from it.
 *
 * This is the single predicate behind every gate on that wall: the edge proxy
 * (`phoneGateDecision`), the server-side layout guard (`requirePhoneVerified`)
 * and the API guard (`requireVerifiedSession`). It lives here, pure and free of
 * `server-only`, so the three cannot drift apart — a gate that disagrees with
 * another gate is a bug that only shows up as a redirect loop or a silent
 * bypass, which is exactly the failure this function exists to prevent.
 *
 * ── Why the exemption is by identity, not by role ────────────────────────────
 *
 * Operators are provisioned from the environment, not by signing up, and some
 * hold no phone at all — so their `phone_verified` flag reads false. Gating them
 * would lock the only accounts able to fix the platform out of the surface that
 * fixes it. The stored role is deliberately not consulted: `admin_pending` is an
 * authenticated administrator mid-second-factor, and is exempt for the same
 * reason the proxy exempts them.
 */
export function clearsPhoneGate(identity: {
  phone?: string | null
  clerkUserId?: string | null
  phoneVerified?: boolean
}): boolean {
  if (identity.phoneVerified) return true
  return isPlatformAdmin(identity)
}
