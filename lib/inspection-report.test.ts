import { describe, expect, it } from 'vitest'
import { computeInspectionHealthScore, computeInspectionSectionHealth } from '@/lib/inspection-report'

describe('computeInspectionHealthScore', () => {
  it('averages safe, note, and damaged items while excluding history markers', () => {
    const result = computeInspectionHealthScore({
      exterior: 'سليم',
      engine: 'ملاحظة',
      brakes: 'متضرر',
      paint: 'مرشوش',
      replaced: 'مستبدل',
      unknown: 'غير معروف',
    })

    expect(result).toEqual({
      score: 50,
      assessedItems: 3,
      excluded: { painted: 1, replaced: 1, unknown: 1 },
    })
  })

  it('returns no score when every result is excluded', () => {
    const result = computeInspectionHealthScore({
      paint: 'مرشوش',
      unknown: 'غير معروف',
    })

    expect(result.score).toBeNull()
    expect(result.assessedItems).toBe(0)
  })

  it('returns a perfect score when all assessed items are safe', () => {
    expect(computeInspectionHealthScore({ one: 'سليم', two: 'سليم' }).score).toBe(100)
  })

  it('calculates each section independently and excludes non-condition results', () => {
    const results = computeInspectionSectionHealth({
      'exterior:hood': 'سليم',
      'exterior:doors': 'متضرر',
      'engine:start': 'ملاحظة',
      'engine:leaks': 'مرشوش',
    })

    expect(results.find((section) => section.id === 'exterior')).toMatchObject({
      score: 50,
      assessedItems: 2,
    })
    expect(results.find((section) => section.id === 'engine')).toMatchObject({
      score: 50,
      assessedItems: 1,
    })
    expect(results.find((section) => section.id === 'brakes')).toMatchObject({
      score: null,
      assessedItems: 0,
    })
  })
})
