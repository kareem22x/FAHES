import { describe, expect, it } from 'vitest'
import {
  MAX_PLAUSIBLE_SPEED_KMH,
  assessFix,
  impliedSpeedKmh,
  isImplausibleAccuracy,
  type LocationFix,
} from './location-integrity'

const T0 = Date.parse('2026-10-07T09:00:00.000Z')

/** Dammam city centre. */
const DAMMAM = { latitude: 26.4207, longitude: 50.0888 }
/** Jubail city centre — about 78 km north-east of Dammam, as the crow flies. */
const JUBAIL = { latitude: 27.0046, longitude: 49.646 }

function fix(overrides: Partial<LocationFix> = {}): LocationFix {
  return {
    latitude: DAMMAM.latitude,
    longitude: DAMMAM.longitude,
    accuracy: 12,
    recordedAtMs: T0,
    ...overrides,
  }
}

describe('isImplausibleAccuracy', () => {
  it('treats an exact zero as fabricated', () => {
    expect(isImplausibleAccuracy(0)).toBe(true)
  })

  it('treats a negative accuracy as nonsense', () => {
    expect(isImplausibleAccuracy(-1)).toBe(true)
  })

  it('accepts a normal reading, however poor', () => {
    expect(isImplausibleAccuracy(12)).toBe(false)
    expect(isImplausibleAccuracy(500)).toBe(false)
  })

  it('does not judge a withheld accuracy', () => {
    // `null` means the browser did not say, which is not the same as "bad".
    expect(isImplausibleAccuracy(null)).toBe(false)
  })
})

describe('assessFix', () => {
  it('clears a first report, because there is nothing to compare it with', () => {
    expect(assessFix(fix(), null)).toEqual({ mock: false, reason: null })
  })

  it('clears a first report even when it is implausibly accurate', () => {
    // The accuracy check does not need a predecessor, so it still applies.
    expect(assessFix(fix({ accuracy: 0 }), null)).toEqual({
      mock: true,
      reason: 'implausible_accuracy',
    })
  })

  it('clears an inspector driving between cities at a normal pace', () => {
    const previous = fix({ recordedAtMs: T0 })
    const current = fix({ ...JUBAIL, recordedAtMs: T0 + 90 * 60_000 })
    expect(assessFix(current, previous)).toEqual({ mock: false, reason: null })
  })

  it('flags a teleport across the province in seconds', () => {
    const previous = fix({ recordedAtMs: T0 })
    const current = fix({ ...JUBAIL, recordedAtMs: T0 + 10_000 })
    expect(assessFix(current, previous)).toEqual({ mock: true, reason: 'impossible_speed' })
  })

  it('flags a stationary jump that no vehicle could make', () => {
    const previous = fix({ recordedAtMs: T0 })
    // ~1.4 km in one second: a sprint on paper, impossible in fact.
    const current = fix({ latitude: 26.4334, longitude: 50.0888, recordedAtMs: T0 + 1_000 })
    expect(assessFix(current, previous).mock).toBe(true)
  })

  it('does not flag movement at exactly the ceiling', () => {
    // The comparison is `>`, so the boundary belongs to the plausible side.
    const previous = fix({ recordedAtMs: T0 })
    const metresPerSecond = MAX_PLAUSIBLE_SPEED_KMH / 3.6
    const current = fix({
      latitude: DAMMAM.latitude + metresPerSecond * 1_000 / 111_320,
      recordedAtMs: T0 + 1_000_000,
    })
    expect(assessFix(current, previous).mock).toBe(false)
  })

  it('skips the speed check when two reports share a timestamp', () => {
    // Dividing by zero would flag every duplicate report, which is exactly what
    // the offline queue produces when it flushes a backlog.
    const previous = fix({ recordedAtMs: T0 })
    const current = fix({ ...JUBAIL, recordedAtMs: T0 })
    expect(assessFix(current, previous)).toEqual({ mock: false, reason: null })
  })

  it('skips the speed check when a report arrives out of order', () => {
    const previous = fix({ recordedAtMs: T0 })
    const current = fix({ ...JUBAIL, recordedAtMs: T0 - 5_000 })
    expect(assessFix(current, previous)).toEqual({ mock: false, reason: null })
  })

  it('prefers the accuracy verdict when both signals are present', () => {
    const previous = fix({ recordedAtMs: T0 })
    const current = fix({ ...JUBAIL, accuracy: 0, recordedAtMs: T0 + 1_000 })
    expect(assessFix(current, previous).reason).toBe('implausible_accuracy')
  })
})

describe('impliedSpeedKmh', () => {
  it('computes the rate between two fixes', () => {
    const previous = fix({ recordedAtMs: T0 })
    const current = fix({ ...JUBAIL, recordedAtMs: T0 + 3_600_000 })
    const speed = impliedSpeedKmh(previous, current)
    expect(speed).toBeGreaterThan(70)
    expect(speed).toBeLessThan(90)
  })

  it('reports null rather than dividing by a non-positive interval', () => {
    const previous = fix({ recordedAtMs: T0 })
    expect(impliedSpeedKmh(previous, fix({ recordedAtMs: T0 }))).toBeNull()
    expect(impliedSpeedKmh(previous, fix({ recordedAtMs: T0 - 1 }))).toBeNull()
  })
})
