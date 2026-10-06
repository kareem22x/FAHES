import { describe, expect, it } from 'vitest'
import {
  AGE_MAX,
  AGE_MIN,
  APPLICATION_ERRORS,
  EMPTY_APPLICATION_DRAFT,
  canonicalSaudiPhone,
  countNameWords,
  coverageStepError,
  draftToPayload,
  identityStepError,
  parseInspectorApplication,
} from '@/lib/inspector-application'

/** A payload that passes every rule — each test perturbs exactly one field. */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'محمد عبدالله القحطاني',
    nationalId: '1234567890',
    phone: '0512345678',
    age: 32,
    experienceYears: 7,
    experienceDetails: 'سبع سنوات في فحص المحرك وناقل الحركة بورشة معتمدة.',
    hasCertificates: true,
    qualification: 'شهادة فحص مركبات',
    cities: ['الدمام'],
    specialties: ['فحص المحرك وناقل الحركة'],
    availability: 'دوام كامل',
    hasEquipment: true,
    notes: '',
    ...overrides,
  }
}

function expectError(payload: unknown, error: string) {
  const result = parseInspectorApplication(payload)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toBe(error)
}

describe('countNameWords', () => {
  it('counts whitespace-separated parts', () => {
    expect(countNameWords('محمد عبدالله القحطاني')).toBe(3)
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(countNameWords('  محمد   عبدالله  القحطاني  ')).toBe(3)
  })

  it('treats an empty string as zero words', () => {
    expect(countNameWords('   ')).toBe(0)
  })
})

describe('canonicalSaudiPhone', () => {
  it('keeps a local 05 number as-is', () => {
    expect(canonicalSaudiPhone('0512345678')).toBe('0512345678')
  })

  it('normalizes the +966 and 00966 forms to the same stored value', () => {
    expect(canonicalSaudiPhone('+966512345678')).toBe('0512345678')
    expect(canonicalSaudiPhone('00966512345678')).toBe('0512345678')
    expect(canonicalSaudiPhone('512345678')).toBe('0512345678')
  })
})

describe('parseInspectorApplication', () => {
  it('accepts a complete application and normalizes it', () => {
    const result = parseInspectorApplication(validPayload())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      fullName: 'محمد عبدالله القحطاني',
      nationalId: '1234567890',
      phone: '0512345678',
      age: 32,
      experienceYears: 7,
      hasCertificates: true,
      cities: ['الدمام'],
    })
  })

  it('rejects a non-object body', () => {
    expectError(null, APPLICATION_ERRORS.malformed)
    expectError([], APPLICATION_ERRORS.malformed)
    expectError('nope', APPLICATION_ERRORS.malformed)
  })

  // ── identity ──────────────────────────────────────────────────────
  it('requires three name parts', () => {
    expectError(validPayload({ fullName: 'محمد القحطاني' }), APPLICATION_ERRORS.fullName)
    expectError(validPayload({ fullName: 'محمد' }), APPLICATION_ERRORS.fullName)
    expectError(validPayload({ fullName: '' }), APPLICATION_ERRORS.fullName)
    expectError(validPayload({ fullName: 42 }), APPLICATION_ERRORS.fullName)
  })

  it('accepts a four-part name', () => {
    expect(parseInspectorApplication(validPayload({ fullName: 'محمد عبدالله سعد القحطاني' })).ok).toBe(true)
  })

  it('requires a 10-digit national ID starting with 1 or 2', () => {
    expect(parseInspectorApplication(validPayload({ nationalId: '2234567890' })).ok).toBe(true)
    expectError(validPayload({ nationalId: '3234567890' }), APPLICATION_ERRORS.nationalId)
    expectError(validPayload({ nationalId: '123456789' }), APPLICATION_ERRORS.nationalId)
    expectError(validPayload({ nationalId: '12345678901' }), APPLICATION_ERRORS.nationalId)
  })

  it('requires a Saudi mobile number', () => {
    expect(parseInspectorApplication(validPayload({ phone: '+966512345678' })).ok).toBe(true)
    expectError(validPayload({ phone: '0412345678' }), APPLICATION_ERRORS.phone)
    expectError(validPayload({ phone: '051234567' }), APPLICATION_ERRORS.phone)
  })

  it('bounds the age to 18–70', () => {
    expect(parseInspectorApplication(validPayload({ age: AGE_MIN })).ok).toBe(true)
    expect(parseInspectorApplication(validPayload({ age: AGE_MAX })).ok).toBe(true)
    expectError(validPayload({ age: AGE_MIN - 1 }), APPLICATION_ERRORS.age)
    expectError(validPayload({ age: AGE_MAX + 1 }), APPLICATION_ERRORS.age)
    expectError(validPayload({ age: 30.5 }), APPLICATION_ERRORS.age)
    expectError(validPayload({ age: '30' }), APPLICATION_ERRORS.age)
  })

  it('bounds experience years to 0–60', () => {
    expect(parseInspectorApplication(validPayload({ experienceYears: 0 })).ok).toBe(true)
    expect(parseInspectorApplication(validPayload({ experienceYears: 60 })).ok).toBe(true)
    expectError(validPayload({ experienceYears: 61 }), APPLICATION_ERRORS.experienceYears)
    expectError(validPayload({ experienceYears: -1 }), APPLICATION_ERRORS.experienceYears)
  })

  it('requires a written experience description', () => {
    expectError(validPayload({ experienceDetails: '' }), APPLICATION_ERRORS.experienceDetails)
    expectError(validPayload({ experienceDetails: 'ا' }), APPLICATION_ERRORS.experienceDetails)
    expectError(
      validPayload({ experienceDetails: 'ا'.repeat(601) }),
      APPLICATION_ERRORS.experienceDetails,
    )
  })

  it('keeps the certificate question tri-state', () => {
    const yes = parseInspectorApplication(validPayload({ hasCertificates: true }))
    const no = parseInspectorApplication(validPayload({ hasCertificates: false }))
    const skipped = parseInspectorApplication(validPayload({ hasCertificates: null }))
    const omitted = parseInspectorApplication(validPayload({ hasCertificates: undefined }))

    expect(yes.ok && yes.value.hasCertificates).toBe(true)
    expect(no.ok && no.value.hasCertificates).toBe(false)
    // Skipping is allowed — and must not be silently recorded as a "no".
    expect(skipped.ok && skipped.value.hasCertificates).toBe(null)
    expect(omitted.ok && omitted.value.hasCertificates).toBe(null)

    expectError(validPayload({ hasCertificates: 'yes' }), APPLICATION_ERRORS.hasCertificates)
  })

  it('caps the certificate text', () => {
    expect(parseInspectorApplication(validPayload({ qualification: 'ا'.repeat(180) })).ok).toBe(true)
    expectError(validPayload({ qualification: 'ا'.repeat(181) }), APPLICATION_ERRORS.qualification)
  })

  // ── coverage ──────────────────────────────────────────────────────
  it('requires at least one operational city', () => {
    expectError(validPayload({ cities: [] }), APPLICATION_ERRORS.cities)
    expectError(validPayload({ cities: ['غير موجودة'] }), APPLICATION_ERRORS.cities)
    expectError(validPayload({ cities: ['الدمام', 'الدمام'] }), APPLICATION_ERRORS.cities)
    expectError(validPayload({ cities: 'الدمام' }), APPLICATION_ERRORS.cities)
  })

  it('requires at least one known specialty', () => {
    expectError(validPayload({ specialties: [] }), APPLICATION_ERRORS.specialties)
    expectError(validPayload({ specialties: ['فحص الطائرات'] }), APPLICATION_ERRORS.specialties)
    expectError(
      validPayload({ specialties: ['فحص المحرك وناقل الحركة', 'فحص المحرك وناقل الحركة'] }),
      APPLICATION_ERRORS.specialties,
    )
  })

  it('requires a known availability option', () => {
    expectError(validPayload({ availability: 'وقت الفراغ' }), APPLICATION_ERRORS.availability)
  })

  it('requires an explicit equipment answer', () => {
    expectError(validPayload({ hasEquipment: 'yes' }), APPLICATION_ERRORS.hasEquipment)
    expect(parseInspectorApplication(validPayload({ hasEquipment: false })).ok).toBe(true)
  })

  it('caps notes', () => {
    expect(parseInspectorApplication(validPayload({ notes: 'ا'.repeat(1000) })).ok).toBe(true)
    expectError(validPayload({ notes: 'ا'.repeat(1001) }), APPLICATION_ERRORS.notes)
  })

  it('trims text fields rather than storing padding', () => {
    const result = parseInspectorApplication(
      validPayload({ fullName: '  محمد عبدالله القحطاني  ', experienceDetails: '  خبرة طويلة  ' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fullName).toBe('محمد عبدالله القحطاني')
    expect(result.value.experienceDetails).toBe('خبرة طويلة')
  })
})

/**
 * The form validates one step at a time, so the step validators must agree with
 * the full parse — otherwise a form that says "next" is allowed is rejected on
 * submit, which is the failure the applicant cannot act on.
 */
describe('step validators', () => {
  it('agree with the full parse on a complete payload', () => {
    const payload = validPayload()
    expect(identityStepError(payload)).toBe(null)
    expect(coverageStepError(payload)).toBe(null)
    expect(parseInspectorApplication(payload).ok).toBe(true)
  })

  it('report identity problems from step 1 only', () => {
    expect(identityStepError(validPayload({ age: 12 }))).toBe(APPLICATION_ERRORS.age)
    expect(identityStepError(validPayload({ phone: '123' }))).toBe(APPLICATION_ERRORS.phone)
    // A coverage field being wrong is not step 1's problem.
    expect(identityStepError(validPayload({ cities: [] }))).toBe(null)
  })

  it('report coverage problems from step 2 only', () => {
    expect(coverageStepError(validPayload({ cities: [] }))).toBe(APPLICATION_ERRORS.cities)
    expect(coverageStepError(validPayload({ hasEquipment: 'yes' }))).toBe(APPLICATION_ERRORS.hasEquipment)
    // An identity field being wrong is not step 2's problem.
    expect(coverageStepError(validPayload({ age: 12 }))).toBe(null)
  })

  it('reject a non-object body on both steps', () => {
    expect(identityStepError(null)).toBe(APPLICATION_ERRORS.malformed)
    expect(coverageStepError(null)).toBe(APPLICATION_ERRORS.malformed)
  })
})

describe('draftToPayload', () => {
  it('maps a blank numeric field to NaN, never to 0', () => {
    // `Number('')` is 0. If the draft conversion used it directly, an applicant
    // who never chose a number would be stored as having zero experience —
    // a valid-looking value the validator could not catch.
    const payload = draftToPayload({ ...EMPTY_APPLICATION_DRAFT })
    expect(payload.age).toBeNaN()
    expect(payload.experienceYears).toBeNaN()
    expect(identityStepError(payload)).toBe(APPLICATION_ERRORS.fullName)
  })

  it('reports the missing number, not a downstream field, once identity is filled', () => {
    const payload = draftToPayload({
      ...EMPTY_APPLICATION_DRAFT,
      fullName: 'محمد عبدالله القحطاني',
      nationalId: '1234567890',
      phone: '0512345678',
      experienceDetails: 'خبرة سبع سنوات',
      // age and experienceYears deliberately left blank
    })
    expect(identityStepError(payload)).toBe(APPLICATION_ERRORS.age)
  })

  it('converts real numeric input', () => {
    const payload = draftToPayload({
      ...EMPTY_APPLICATION_DRAFT,
      age: ' 32 ',
      experienceYears: '7',
    })
    expect(payload.age).toBe(32)
    expect(payload.experienceYears).toBe(7)
  })

  it('treats whitespace-only numeric input as blank', () => {
    const payload = draftToPayload({ ...EMPTY_APPLICATION_DRAFT, age: '   ' })
    expect(payload.age).toBeNaN()
  })
})
