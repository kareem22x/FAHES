import 'server-only'
import { isPlatformAdmin, isPlatformOwner } from '@/lib/identity-predicates'
import { getUserByClerkId } from '@/lib/user-store'

/**
 * The single decision function behind the phone-verification gate.
 *
 * Both the edge proxy and the server-side layout guards call this, so the fast
 * path and the authoritative path can never disagree about who is blocked.
 *
 * ── Why operators are exempt ─────────────────────────────────────────────────
 *
 * Platform owners and admins are provisioned from the environment, not by signing
 * up. Some hold no phone on their profile at all, and their `phone_verified` flag
 * therefore reads false. Gating them would lock the only accounts able to fix the
 * platform out of the console that fixes it. They are exempt by identity, exactly
 * as they are for the admin access-code gate.
 *
 * ── Why a lookup failure allows the request through ──────────────────────────
 *
 * This is a deliberate fail-open. The alternative — failing closed — turns any
 * transient Supabase blip into a platform-wide lockout for every verified user,
 * because the gate cannot tell "unverified" from "unknown". The flag is still
 * enforced by the server-side guard on the next render and by the OTP RPC that is
 * the only writer of the flag, so a degraded proxy is a slow gate, not an open one.
 */

export type PhoneGateDecision =
  | { action: 'allow'; reason: 'verified' | 'exempt' | 'unknown_user' | 'degraded' }
  | { action: 'block'; reason: 'unverified' | 'no_phone' }

export async function phoneGateDecision(clerkUserId: string): Promise<PhoneGateDecision> {
  try {
    const user = await getUserByClerkId(clerkUserId)
    if (!user) return { action: 'allow', reason: 'unknown_user' }

    const identity = { phone: user.phone, clerkUserId }
    if (isPlatformOwner(identity) || isPlatformAdmin(identity)) {
      return { action: 'allow', reason: 'exempt' }
    }

    if (user.phoneVerified) return { action: 'allow', reason: 'verified' }
    return { action: 'block', reason: user.phone === null ? 'no_phone' : 'unverified' }
  } catch (error) {
    console.error('phone_gate_lookup_failed', error)
    return { action: 'allow', reason: 'degraded' }
  }
}
