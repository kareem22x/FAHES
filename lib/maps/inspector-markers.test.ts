import { describe, expect, it } from 'vitest'
import {
  LOCATION_STALE_AFTER_MS,
  ageOf,
  formatArabicAgo,
  inspectorMarkers,
  type InspectorPlot,
} from './inspector-markers'

const NOW = Date.parse('2026-10-07T13:00:00.000Z')

function plot(overrides: Partial<InspectorPlot> = {}): InspectorPlot {
  return {
    id: 'loc-1',
    inspector_name: 'محمد القحطاني',
    inspector_phone: '0551234567',
    latitude: 26.4207,
    longitude: 50.0888,
    status: 'available',
    battery_level: 80,
    speed: 0,
    accuracy_m: 12,
    is_mock_location: false,
    updated_at: new Date(NOW - 30_000).toISOString(),
    ...overrides,
  }
}

describe('formatArabicAgo', () => {
  it('calls the last minute "now"', () => {
    expect(formatArabicAgo(0)).toBe('الآن')
    expect(formatArabicAgo(59_000)).toBe('الآن')
  })

  it('uses the dual, not the plural, for exactly two', () => {
    expect(formatArabicAgo(60_000)).toBe('قبل دقيقة')
    expect(formatArabicAgo(120_000)).toBe('قبل دقيقتين')
  })

  it('uses the plural for three through ten', () => {
    expect(formatArabicAgo(3 * 60_000)).toBe('قبل 3 دقائق')
    expect(formatArabicAgo(10 * 60_000)).toBe('قبل 10 دقائق')
  })

  it('returns to the singular at eleven, which is the Arabic rule', () => {
    // "قبل 11 دقائق" is the form a non-native implementation produces and a
    // native reader notices immediately.
    expect(formatArabicAgo(11 * 60_000)).toBe('قبل 11 دقيقة')
    expect(formatArabicAgo(59 * 60_000)).toBe('قبل 59 دقيقة')
  })

  it('steps up to hours and days', () => {
    expect(formatArabicAgo(2 * 3_600_000)).toBe('قبل ساعتين')
    expect(formatArabicAgo(5 * 3_600_000)).toBe('قبل 5 ساعات')
    expect(formatArabicAgo(25 * 3_600_000)).toBe('قبل يوم')
    expect(formatArabicAgo(3 * 86_400_000)).toBe('قبل 3 أيام')
  })

  it('never renders a negative age', () => {
    // Clock skew between the phone and the server can date a fix in the future.
    expect(formatArabicAgo(-5_000)).toBe('الآن')
  })
})

describe('ageOf', () => {
  it('measures from the supplied instant, not from the wall clock', () => {
    expect(ageOf(new Date(NOW - 90_000).toISOString(), NOW)).toBe(90_000)
  })

  it('reports null for an unparseable timestamp instead of NaN', () => {
    // NaN would make every staleness comparison false, so a row with a broken
    // timestamp would read as fresh forever.
    expect(ageOf('not-a-date', NOW)).toBeNull()
    expect(ageOf('', NOW)).toBeNull()
  })

  it('clamps a future timestamp to zero', () => {
    expect(ageOf(new Date(NOW + 60_000).toISOString(), NOW)).toBe(0)
  })
})

describe('inspectorMarkers', () => {
  it('plots a healthy inspector', () => {
    const [marker] = inspectorMarkers([plot()], NOW)
    expect(marker.id).toBe('loc-1')
    expect(marker.title).toBe('محمد القحطاني')
    expect(marker.tone).toBe('good')
    expect(marker.flagged).toBe(false)
  })

  it('drops rows that cannot be plotted rather than pinning them at zero', () => {
    const markers = inspectorMarkers(
      [
        plot({ id: 'ok' }),
        plot({ id: 'nan-lat', latitude: Number.NaN }),
        plot({ id: 'out-of-range', longitude: 200 }),
      ],
      NOW,
    )
    expect(markers.map((marker) => marker.id)).toEqual(['ok'])
  })

  it('colours by status', () => {
    const markers = inspectorMarkers(
      [
        plot({ id: 'a', status: 'available' }),
        plot({ id: 'b', status: 'en_route' }),
        plot({ id: 'c', status: 'inspecting' }),
        plot({ id: 'd', status: 'offline' }),
      ],
      NOW,
    )
    expect(markers.map((marker) => marker.tone)).toEqual(['good', 'warn', 'info', 'neutral'])
  })

  it('lets a spoofed fix outrank the inspector’s own status', () => {
    // The faked position *is* the finding; painting it green because the
    // inspector marked themselves available would hide it.
    const [marker] = inspectorMarkers([plot({ status: 'available', is_mock_location: true })], NOW)
    expect(marker.tone).toBe('bad')
    expect(marker.flagged).toBe(true)
    expect(marker.glyph).toBe('!')
  })

  it('pulses only while a fix is fresh and the inspector is moving', () => {
    const fresh = inspectorMarkers([plot({ status: 'inspecting' })], NOW)
    expect(fresh[0].pulse).toBe(true)

    const stale = inspectorMarkers(
      [plot({ status: 'inspecting', updated_at: new Date(NOW - LOCATION_STALE_AFTER_MS - 1).toISOString() })],
      NOW,
    )
    expect(stale[0].pulse).toBe(false)

    const idle = inspectorMarkers([plot({ status: 'available' })], NOW)
    expect(idle[0].pulse).toBe(false)
  })

  it('stops pulsing when the timestamp is unreadable', () => {
    const [marker] = inspectorMarkers([plot({ status: 'inspecting', updated_at: 'garbage' })], NOW)
    expect(marker.pulse).toBe(false)
  })

  it('always carries the coordinates and the age in the popup', () => {
    const [marker] = inspectorMarkers([plot()], NOW)
    const labels = marker.details?.map((detail) => detail.label) ?? []
    expect(labels).toContain('الإحداثيات')
    expect(labels).toContain('آخر تحديث')
    expect(labels).toContain('البطارية')
    expect(marker.details?.find((detail) => detail.label === 'الإحداثيات')?.value).toBe('26.4207، 50.0888')
  })

  it('translates the status rather than leaking the enum to the operator', () => {
    const [marker] = inspectorMarkers([plot({ status: 'en_route' })], NOW)
    expect(marker.details?.find((detail) => detail.label === 'الحالة')?.value).toBe('في الطريق')
  })

  it('omits speed when stationary and says so when battery is unknown', () => {
    const [marker] = inspectorMarkers([plot({ speed: 0, battery_level: null })], NOW)
    const labels = marker.details?.map((detail) => detail.label) ?? []
    expect(labels).not.toContain('السرعة')
    expect(marker.details?.find((detail) => detail.label === 'البطارية')?.value).toBe('غير معروفة')
  })

  it('shows speed once the inspector is actually moving', () => {
    const [marker] = inspectorMarkers([plot({ speed: 42.4 })], NOW)
    expect(marker.details?.find((detail) => detail.label === 'السرعة')?.value).toBe('42 كم/س')
  })

  it('falls back to a generic name rather than rendering an empty pin title', () => {
    const [marker] = inspectorMarkers([plot({ inspector_name: '' })], NOW)
    expect(marker.title).toBe('فاحص')
  })

  it('returns nothing for no rows', () => {
    expect(inspectorMarkers([], NOW)).toEqual([])
  })
})
