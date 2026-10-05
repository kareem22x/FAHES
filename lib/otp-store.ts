import 'server-only'
import { hashOtp, isValidOtpShape, otpConfig } from '@/lib/otp'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { randomOtp } from '@/lib/web-crypto'

/**
 * Server-side wrapper around the phone-OTP RPCs.
 *
 * The challenge table (`otp_challenges`) and its verify function are part of the
 * core schema and are keyed by phone. This module adds the two pieces the gate
 * needs: a cooldown-aware issue step, and the account-keyed flag flip that follows
 * a successful verification.
 *
 * The plaintext code is generated here, handed to the SMS provider, and then
 * forgotten — only its HMAC digest is ever persisted.
 */

export type IssueOtpResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; reason: 'locked' | 'cooldown' | 'unavailable' }

export type ConsumeOtpResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'no_challenge' | 'locked' | 'not_found' | 'unavailable' }

export type OtpState = {
  failedAttempts: number
  lockedUntilMs: number | null
  lastSentAtMs: number | null
}

/** True when the supporting RPC is absent — i.e. this migration is not applied. */
function isMissingRpc(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST202') return true
  return /could not find the function|schema cache/i.test(error.message ?? '')
}

export async function issuePhoneOtp(phone: string): Promise<IssueOtpResult> {
  const config = otpConfig()
  const code = randomOtp()
  const codeHash = await hashOtp(phone, code)

  const { data, error } = await getSupabaseAdmin().rpc('issue_phone_otp', {
    p_phone: phone,
    p_code_hash: codeHash,
    p_expiry_minutes: config.expiryMinutes,
    p_cooldown_seconds: config.resendCooldownSeconds,
  })

  if (error) {
    if (isMissingRpc(error)) return { ok: false, reason: 'unavailable' }
    throw new Error(`Supabase OTP issue failed: ${error.message}`)
  }

  const verdict = typeof data === 'string' ? data : 'unavailable'
  if (verdict === 'locked' || verdict === 'cooldown') return { ok: false, reason: verdict }
  if (verdict !== 'ok') return { ok: false, reason: 'unavailable' }

  return {
    ok: true,
    code,
    expiresAt: new Date(Date.now() + config.expiryMinutes * 60_000).toISOString(),
  }
}

/**
 * Verifies the code and, on success, flips `phone_verified` for `userId`.
 *
 * Two RPCs rather than one, because the challenge is phone-keyed while the flag is
 * account-keyed. The order is safe: `verify_otp_challenge` burns the challenge
 * first, so the only possible partial failure is "code consumed but flag not set",
 * which is recoverable (request a new code) and never the reverse.
 */
export async function consumePhoneOtp(
  userId: string,
  phone: string,
  code: string,
): Promise<ConsumeOtpResult> {
  if (!isValidOtpShape(code)) return { ok: false, reason: 'invalid' }

  const config = otpConfig()
  const codeHash = await hashOtp(phone, code)

  const { data, error } = await getSupabaseAdmin().rpc('verify_otp_challenge', {
    p_phone: phone,
    p_code_hash: codeHash,
    p_max_attempts: config.maxAttempts,
    p_lock_ms: config.lockoutSeconds * 1000,
  })

  if (error) {
    if (isMissingRpc(error)) return { ok: false, reason: 'unavailable' }
    throw new Error(`Supabase OTP verify failed: ${error.message}`)
  }

  const payload = (data ?? {}) as { status?: string; attempts?: number }
  const status = payload.status

  if (status === 'valid') {
    const { data: marked, error: markError } = await getSupabaseAdmin().rpc('mark_phone_verified', {
      p_user_id: userId,
    })
    if (markError) throw new Error(`Supabase phone-verify flag failed: ${markError.message}`)
    if (!marked) return { ok: false, reason: 'not_found' }
    return { ok: true }
  }

  if (status === 'invalid') return { ok: false, reason: 'invalid' }
  if (status === 'expired') return { ok: false, reason: 'expired' }
  if (status === 'locked') return { ok: false, reason: 'locked' }
  if (status === 'missing') return { ok: false, reason: 'no_challenge' }
  return { ok: false, reason: 'unavailable' }
}

/**
 * Reads the throttle state so the UI can show remaining attempts and a live
 * lockout countdown. Returns `null` when the challenge table is absent.
 */
export async function readOtpState(phone: string): Promise<OtpState | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('otp_challenges')
    .select('attempts, locked_until, last_sent_at')
    .eq('phone', phone)
    .maybeSingle()

  if (error || !data) return null

  const row = data as {
    attempts?: number | null
    locked_until?: string | null
    last_sent_at?: string | null
  }

  return {
    failedAttempts: row.attempts ?? 0,
    lockedUntilMs: row.locked_until ? Date.parse(row.locked_until) : null,
    lastSentAtMs: row.last_sent_at ? Date.parse(row.last_sent_at) : null,
  }
}
