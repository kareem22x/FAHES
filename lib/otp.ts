import { hmacHex } from '@/lib/web-crypto'

/**
 * Phone-verification OTP primitives.
 *
 * Kept free of `server-only` and of Supabase so the timing and validation rules
 * can be unit-tested in the node environment — the same split the project uses
 * for `lib/phone.ts` and `lib/safe-return-path.ts`.
 */

export const OTP_LENGTH = 6

/** Failed-attempt lockout window. Fixed by product decision, not env-tunable. */
export const OTP_LOCKOUT_MINUTES = 15

export type OtpConfig = {
  expiryMinutes: number
  maxAttempts: number
  resendCooldownSeconds: number
  lockoutSeconds: number
}

/** Parses an env integer, clamped to a sane range so a typo cannot disable a rule. */
function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

export function otpConfig(): OtpConfig {
  return {
    // Three minutes, per the platform brief. Kept short on purpose: the resend
    // cooldown is only 60s, so a user who mistypes is never stuck waiting longer
    // than a minute for a fresh code, while a leaked code goes stale fast.
    expiryMinutes: readInt(process.env.OTP_EXPIRY_MINUTES, 3, 1, 30),
    maxAttempts: readInt(process.env.OTP_MAX_ATTEMPTS, 5, 3, 10),
    resendCooldownSeconds: readInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60, 30, 600),
    lockoutSeconds: OTP_LOCKOUT_MINUTES * 60,
  }
}

export function getOtpPepper(): string {
  const pepper = process.env.OTP_PEPPER
  if (!pepper || pepper.length < 32) {
    throw new Error('OTP_PEPPER must contain at least 32 characters')
  }
  return pepper
}

/** Exactly six digits — rejects spaces, Arabic-Indic digits and stray characters. */
export function isValidOtpShape(code: string): boolean {
  return /^\d{6}$/.test(code)
}

/**
 * Digest stored in `otp_challenges.code_hash`.
 *
 * The subject (the phone number the challenge is keyed by) is folded into the
 * message, so the same six digits produce a different digest per phone: a leaked
 * digest for one number tells an attacker nothing about another.
 */
export async function hashOtp(subject: string, code: string): Promise<string> {
  return hmacHex(getOtpPepper(), `${subject}:${code}`)
}

/** Whole seconds a user must still wait before requesting a new code. */
export function cooldownRemainingSeconds(
  lastSentAtMs: number | null,
  nowMs: number,
  cooldownSeconds: number,
): number {
  if (lastSentAtMs === null) return 0
  const elapsed = Math.floor((nowMs - lastSentAtMs) / 1000)
  return Math.max(0, cooldownSeconds - elapsed)
}

/** Whole seconds left on an active lockout, or 0 when none is in force. */
export function lockoutRemainingSeconds(lockedUntilMs: number | null, nowMs: number): number {
  if (lockedUntilMs === null) return 0
  return Math.max(0, Math.ceil((lockedUntilMs - nowMs) / 1000))
}

/** Attempts left before the account locks. Never negative. */
export function attemptsRemaining(attempts: number, maxAttempts: number): number {
  return Math.max(0, maxAttempts - attempts)
}

/** `m:ss` countdown for the resend button. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
