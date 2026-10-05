import { describe, expect, it } from 'vitest'
import { describeAge, formatAccountAge, formatLastSeen } from '@/lib/relative-time'

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0) // 2026-10-05T12:00:00Z
const DAY = 86_400_000

function daysAgo(days: number) {
  return NOW - days * DAY
}

describe('describeAge', () => {
  it('treats under a day as "أقل من يوم"', () => {
    expect(describeAge(NOW, NOW)).toBe('أقل من يوم')
    expect(describeAge(NOW - 23 * 60 * 60 * 1000, NOW)).toBe('أقل من يوم')
  })

  it('counts whole days below a month', () => {
    expect(describeAge(daysAgo(1), NOW)).toBe('1 يوم')
    expect(describeAge(daysAgo(2), NOW)).toBe('2 يومان')
    expect(describeAge(daysAgo(5), NOW)).toBe('5 أيام')
    expect(describeAge(daysAgo(29), NOW)).toBe('29 يوم')
  })

  it('switches to months at 30 days, not 31', () => {
    // The boundary is the one place an off-by-one is invisible in review and
    // obvious to a user, so it is pinned explicitly.
    expect(describeAge(daysAgo(29), NOW)).toBe('29 يوم')
    expect(describeAge(daysAgo(30), NOW)).toBe('1 شهر')
  })

  it('counts months below a year', () => {
    expect(describeAge(daysAgo(60), NOW)).toBe('2 شهران')
    expect(describeAge(daysAgo(150), NOW)).toBe('5 أشهر')
    expect(describeAge(daysAgo(364), NOW)).toBe('12 شهر')
  })

  it('switches to years at 365 days, not at twelve 30-day months', () => {
    // The seam used to sit at 360 days (12 × 30), so a 360-day-old account was
    // announced as a year old while a 350-day-old one read "11 شهر" — the label
    // jumped a month and overstated the age for five days of every year.
    expect(describeAge(daysAgo(359), NOW)).toBe('11 شهر')
    expect(describeAge(daysAgo(360), NOW)).toBe('12 شهر')
    expect(describeAge(daysAgo(364), NOW)).toBe('12 شهر')
    expect(describeAge(daysAgo(365), NOW)).toBe('1 سنة')
  })

  it('carries the leftover months into the year label', () => {
    expect(describeAge(daysAgo(400), NOW)).toBe('1 سنة و1 شهر')
    expect(describeAge(daysAgo(365 * 2 + 90), NOW)).toBe('2 سنتان و3 أشهر')
    expect(describeAge(daysAgo(365 * 3), NOW)).toBe('3 سنوات')
  })

  it('follows Arabic pluralisation, including the singular after 11', () => {
    // 1 singular, 2 dual, 3–10 plural, 11+ back to the singular. Getting this
    // wrong reads as broken Arabic to a native speaker, and it is invisible in
    // English-language review, so each band is pinned.
    expect(describeAge(daysAgo(1), NOW)).toBe('1 يوم')
    expect(describeAge(daysAgo(2), NOW)).toBe('2 يومان')
    expect(describeAge(daysAgo(3), NOW)).toBe('3 أيام')
    expect(describeAge(daysAgo(10), NOW)).toBe('10 أيام')
    expect(describeAge(daysAgo(11), NOW)).toBe('11 يوم')
    expect(describeAge(daysAgo(29), NOW)).toBe('29 يوم')

    expect(describeAge(daysAgo(30), NOW)).toBe('1 شهر')
    expect(describeAge(daysAgo(60), NOW)).toBe('2 شهران')
    expect(describeAge(daysAgo(90), NOW)).toBe('3 أشهر')
    expect(describeAge(daysAgo(330), NOW)).toBe('11 شهر')

    expect(describeAge(daysAgo(365), NOW)).toBe('1 سنة')
    expect(describeAge(daysAgo(730), NOW)).toBe('2 سنتان')
    expect(describeAge(daysAgo(1095), NOW)).toBe('3 سنوات')
    expect(describeAge(daysAgo(365 * 11), NOW)).toBe('11 سنة')
  })

  it('never returns a negative duration', () => {
    // A future timestamp means clock skew or a bad write. "-3 يوم" in the
    // agent's sidebar is worse than saying nothing useful.
    expect(describeAge(NOW + 5 * DAY, NOW)).toBe('الآن')
  })

  it('survives non-finite input', () => {
    expect(describeAge(Number.NaN, NOW)).toBe('الآن')
    expect(describeAge(Number.POSITIVE_INFINITY, NOW)).toBe('الآن')
  })
})

describe('formatAccountAge', () => {
  it('formats a real creation date', () => {
    expect(formatAccountAge(daysAgo(90), NOW)).toBe('3 أشهر')
  })

  it('returns null rather than inventing an age', () => {
    // null/0/NaN all mean "we do not know", and the caller omits the row.
    // Returning "56 سنة" for epoch 0 would be a confident lie.
    expect(formatAccountAge(null, NOW)).toBeNull()
    expect(formatAccountAge(undefined, NOW)).toBeNull()
    expect(formatAccountAge(0, NOW)).toBeNull()
    expect(formatAccountAge(Number.NaN, NOW)).toBeNull()
  })
})

describe('formatLastSeen', () => {
  it('formats a real last-login', () => {
    expect(formatLastSeen(daysAgo(3), NOW)).toBe('3 أيام')
  })

  it('says so explicitly when there is no login on record', () => {
    // Unlike account age, a missing last-login is informative and worth stating.
    expect(formatLastSeen(null, NOW)).toBe('لا يوجد تسجيل دخول مسجّل')
    expect(formatLastSeen(0, NOW)).toBe('لا يوجد تسجيل دخول مسجّل')
  })
})
