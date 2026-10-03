import { describe, expect, it } from 'vitest'
import { isValidInspectionConsent } from '@/lib/inspection-booking'
import { inspectionTermsVersion } from '@/types/booking'

describe('isValidInspectionConsent', () => {
  it('accepts an explicit consent to the active terms version', () => {
    expect(isValidInspectionConsent(true, inspectionTermsVersion)).toBe(true)
  })

  it('rejects missing consent and stale terms versions', () => {
    expect(isValidInspectionConsent(false, inspectionTermsVersion)).toBe(false)
    expect(isValidInspectionConsent(true, 'old-version')).toBe(false)
  })
})
