import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  OTP_LOCKOUT_MINUTES,
  attemptsRemaining,
  cooldownRemainingSeconds,
  formatCountdown,
  hashOtp,
  isValidOtpShape,
  lockoutRemainingSeconds,
  otpConfig,
} from '@/lib/otp'

describe('isValidOtpShape', () => {
  it('accepts exactly six digits', () => {
    expect(isValidOtpShape('000000')).toBe(true)
    expect(isValidOtpShape('123456')).toBe(true)
  })

  it('rejects wrong length, spaces, letters and non-ASCII digits', () => {
    expect(isValidOtpShape('12345')).toBe(false)
    expect(isValidOtpShape('1234567')).toBe(false)
    expect(isValidOtpShape('123 56')).toBe(false)
    expect(isValidOtpShape('12a456')).toBe(false)
    expect(isValidOtpShape('١٢٣٤٥٦')).toBe(false)
    expect(isValidOtpShape('')).toBe(false)
  })
})

describe('cooldownRemainingSeconds', () => {
  const now = 1_000_000_000_000

  it('returns the full window when a code was just sent', () => {
    expect(cooldownRemainingSeconds(now, now, 60)).toBe(60)
  })

  it('counts down as time passes', () => {
    expect(cooldownRemainingSeconds(now - 25_000, now, 60)).toBe(35)
  })

  it('never goes negative once the window has elapsed', () => {
    expect(cooldownRemainingSeconds(now - 90_000, now, 60)).toBe(0)
  })

  it('returns zero when no code has ever been sent', () => {
    expect(cooldownRemainingSeconds(null, now, 60)).toBe(0)
  })
})

describe('lockoutRemainingSeconds', () => {
  const now = 1_000_000_000_000

  it('rounds up so a sub-second remainder still shows as 1s', () => {
    expect(lockoutRemainingSeconds(now + 1_500, now)).toBe(2)
  })

  it('returns zero for an expired or absent lockout', () => {
    expect(lockoutRemainingSeconds(now - 1, now)).toBe(0)
    expect(lockoutRemainingSeconds(null, now)).toBe(0)
  })
})

describe('attemptsRemaining', () => {
  it('subtracts used attempts', () => {
    expect(attemptsRemaining(2, 5)).toBe(3)
  })

  it('never reports a negative allowance', () => {
    expect(attemptsRemaining(7, 5)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(9)).toBe('0:09')
    expect(formatCountdown(125)).toBe('2:05')
  })

  it('clamps negatives to zero', () => {
    expect(formatCountdown(-5)).toBe('0:00')
  })
})

describe('otpConfig', () => {
  const original = { ...process.env }
  beforeEach(() => {
    delete process.env.OTP_EXPIRY_MINUTES
    delete process.env.OTP_MAX_ATTEMPTS
    delete process.env.OTP_RESEND_COOLDOWN_SECONDS
  })
  afterEach(() => {
    process.env = { ...original }
  })

  it('falls back to safe defaults when unset', () => {
    const config = otpConfig()
    // 3 minutes, matching the platform brief. The 60s resend cooldown is what
    // makes such a short window tolerable.
    expect(config.expiryMinutes).toBe(3)
    expect(config.maxAttempts).toBe(5)
    expect(config.resendCooldownSeconds).toBe(60)
    expect(config.lockoutSeconds).toBe(OTP_LOCKOUT_MINUTES * 60)
  })

  it('clamps out-of-range values instead of trusting them', () => {
    process.env.OTP_MAX_ATTEMPTS = '999'
    process.env.OTP_EXPIRY_MINUTES = '0'
    expect(otpConfig().maxAttempts).toBe(10)
    expect(otpConfig().expiryMinutes).toBe(1)
  })

  it('ignores garbage input', () => {
    process.env.OTP_RESEND_COOLDOWN_SECONDS = 'soon'
    expect(otpConfig().resendCooldownSeconds).toBe(60)
  })
})

describe('hashOtp', () => {
  const original = { ...process.env }
  beforeEach(() => {
    process.env.OTP_PEPPER = 'x'.repeat(40)
  })
  afterEach(() => {
    process.env = { ...original }
  })

  it('is deterministic for the same user and code', async () => {
    const a = await hashOtp('user-1', '123456')
    const b = await hashOtp('user-1', '123456')
    expect(a).toBe(b)
  })

  it('differs per user so one leaked digest reveals nothing about another', async () => {
    const a = await hashOtp('user-1', '123456')
    const b = await hashOtp('user-2', '123456')
    expect(a).not.toBe(b)
  })

  it('differs per code', async () => {
    expect(await hashOtp('user-1', '123456')).not.toBe(await hashOtp('user-1', '654321'))
  })

  it('never returns the plaintext', async () => {
    const digest = await hashOtp('user-1', '123456')
    expect(digest).not.toContain('123456')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses to hash with a weak pepper', async () => {
    process.env.OTP_PEPPER = 'short'
    await expect(hashOtp('user-1', '123456')).rejects.toThrow(/OTP_PEPPER/)
  })
})
