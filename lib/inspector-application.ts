import { SUPPORTED_CITIES, isOperationalCity } from '@/lib/locations/saudi-cities'
import { isValidSaudiMobile, normalizePhone } from '@/lib/phone'
import {
  inspectorAvailabilities,
  inspectorSpecialties,
  type InspectorApplicationInput,
} from '@/types/domain'

/**
 * The single source of truth for what a valid inspector application is.
 *
 * Both intake routes — `/api/inspectors/apply` (a signed-in user completing the
 * questionnaire) and `/api/inspectors/register` (the sign-up wizard, which also
 * creates the Clerk account) — previously carried their own copy of these
 * checks. Two copies of a validation rule drift: the wizard accepted what the
 * questionnaire rejected, and neither was covered by a test because the logic
 * lived inside a route handler that `vitest` never loads
 * (`include: lib/**\/*.test.ts`).
 *
 * Pure by construction: no request, no database, no `server-only`. That is what
 * lets it be tested directly.
 */

export const AGE_MIN = 18
export const AGE_MAX = 70
export const FULL_NAME_MIN_WORDS = 3
export const FULL_NAME_MAX = 80
export const EXPERIENCE_YEARS_MAX = 60
export const EXPERIENCE_DETAILS_MIN = 2
export const EXPERIENCE_DETAILS_MAX = 600
export const CERTIFICATE_MAX = 180
export const NOTES_MAX = 1000

/**
 * One reason per message, per the project's error-message rule. Each string is
 * safe to render in Arabic and names the field the applicant must fix — never a
 * generic «تحقق من إجاباتك» that leaves them guessing.
 */
export const APPLICATION_ERRORS = {
  malformed: 'بيانات الطلب غير صالحة',
  fullName: `أدخل الاسم الثلاثي الكامل (${FULL_NAME_MIN_WORDS} كلمات على الأقل).`,
  nationalId: 'رقم الهوية يجب أن يكون 10 أرقام ويبدأ بـ 1 (سعودي) أو 2 (مقيم).',
  phone: 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.',
  age: `العمر يجب أن يكون بين ${AGE_MIN} و ${AGE_MAX} سنة.`,
  experienceYears: 'حدد عدد سنوات الخبرة.',
  experienceDetails: `اكتب وصفًا موجزًا لخبرتك (${EXPERIENCE_DETAILS_MIN} أحرف على الأقل).`,
  hasCertificates: 'قيمة حقل الشهادات غير صالحة.',
  qualification: `حقل الشهادات غير صالح (${CERTIFICATE_MAX} حرفًا كحد أقصى).`,
  cities: 'اختر مدينة عمل واحدة على الأقل من المدن المتاحة.',
  specialties: 'اختر مجال خبرة واحدًا على الأقل.',
  availability: 'حدد نوع التفرغ المناسب لك.',
  hasEquipment: 'حدد ما إذا كانت معدات الفحص متوفرة لديك.',
  notes: `حقل الملاحظات غير صالح (${NOTES_MAX} حرفًا كحد أقصى).`,
} as const

export type InspectorApplicationParse =
  | { ok: true; value: InspectorApplicationInput }
  | { ok: false; error: string }

/**
 * What the form holds while the applicant is typing.
 *
 * The numeric fields are strings because that is what an `<input>` gives back,
 * and an unanswered `<select>` is `''`. Converting in the component would hide
 * the one conversion that silently corrupts data — see `draftToPayload`.
 */
export type InspectorApplicationDraft = {
  fullName: string
  nationalId: string
  phone: string
  age: string
  experienceYears: string
  experienceDetails: string
  hasCertificates: boolean | null
  qualification: string
  cities: string[]
  specialties: string[]
  availability: string
  hasEquipment: boolean | null
  notes: string
}

export const EMPTY_APPLICATION_DRAFT: InspectorApplicationDraft = {
  fullName: '',
  nationalId: '',
  phone: '',
  age: '',
  experienceYears: '',
  experienceDetails: '',
  hasCertificates: null,
  qualification: '',
  cities: [],
  specialties: [],
  availability: '',
  hasEquipment: null,
  notes: '',
}

/**
 * Draft → the payload the step validators and the API both read.
 *
 * The trap this exists to close: `Number('')` is `0`, not `NaN`. Converting an
 * unanswered field with a bare `Number()` would turn «لم يُجب» into a valid
 * `experienceYears: 0` — an applicant who never answered would be recorded as
 * having under a year of experience. Blank therefore maps to `NaN`, which fails
 * `Number.isInteger` in the validator and surfaces the real message.
 */
export function draftToPayload(draft: InspectorApplicationDraft): Record<string, unknown> {
  const toNumber = (value: string): number => {
    const trimmed = value.trim()
    return trimmed === '' ? Number.NaN : Number(trimmed)
  }

  return {
    fullName: draft.fullName,
    nationalId: draft.nationalId,
    phone: draft.phone,
    age: toNumber(draft.age),
    experienceYears: toNumber(draft.experienceYears),
    experienceDetails: draft.experienceDetails,
    hasCertificates: draft.hasCertificates,
    qualification: draft.qualification,
    cities: draft.cities,
    specialties: draft.specialties,
    availability: draft.availability,
    hasEquipment: draft.hasEquipment,
    notes: draft.notes,
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Counts whitespace-separated words — «محمد عبدالله القحطاني» is three. */
export function countNameWords(name: string): number {
  return name.trim().split(/\s+/).filter(Boolean).length
}

/** Canonical stored form: `05XXXXXXXX`, which is how the applicant typed it. */
export function canonicalSaudiPhone(phone: string): string {
  return `0${normalizePhone(phone)}`
}

/**
 * Step 1 — identity. Returns the single reason to show, or `null` when the step
 * is complete.
 *
 * Exported so the form can validate one step at a time without duplicating a
 * single rule: the "next" button on step 1 calls exactly the checks the server
 * will run on submit.
 *
 * `skipPhone` is for the sign-up wizard, whose identity step runs *before* the
 * account step that collects the number — there is genuinely nothing to check
 * yet. It is opt-in and never used by `parseInspectorApplication`, so the server
 * still refuses a payload with no valid phone.
 */
export function identityStepError(
  raw: unknown,
  options: { skipPhone?: boolean } = {},
): string | null {
  if (!isPlainObject(raw)) return APPLICATION_ERRORS.malformed

  const { fullName, nationalId, phone, age, experienceYears, experienceDetails, hasCertificates, qualification } = raw

  if (typeof fullName !== 'string' || countNameWords(fullName) < FULL_NAME_MIN_WORDS || fullName.trim().length > FULL_NAME_MAX) {
    return APPLICATION_ERRORS.fullName
  }

  if (typeof nationalId !== 'string' || !/^[12][0-9]{9}$/.test(nationalId.trim())) {
    return APPLICATION_ERRORS.nationalId
  }

  if (!options.skipPhone && (typeof phone !== 'string' || !isValidSaudiMobile(phone))) {
    return APPLICATION_ERRORS.phone
  }

  if (typeof age !== 'number' || !Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) {
    return APPLICATION_ERRORS.age
  }

  if (
    typeof experienceYears !== 'number' ||
    !Number.isInteger(experienceYears) ||
    experienceYears < 0 ||
    experienceYears > EXPERIENCE_YEARS_MAX
  ) {
    return APPLICATION_ERRORS.experienceYears
  }

  if (
    typeof experienceDetails !== 'string' ||
    experienceDetails.trim().length < EXPERIENCE_DETAILS_MIN ||
    experienceDetails.length > EXPERIENCE_DETAILS_MAX
  ) {
    return APPLICATION_ERRORS.experienceDetails
  }

  // Tri-state: omitted / `null` both mean "not answered", which is allowed.
  const certificatesAnswered = hasCertificates !== undefined && hasCertificates !== null
  if (certificatesAnswered && typeof hasCertificates !== 'boolean') {
    return APPLICATION_ERRORS.hasCertificates
  }

  if (typeof qualification !== 'string' || qualification.length > CERTIFICATE_MAX) {
    return APPLICATION_ERRORS.qualification
  }

  return null
}

/** Step 2 — coverage. Same contract as `identityStepError`. */
export function coverageStepError(raw: unknown): string | null {
  if (!isPlainObject(raw)) return APPLICATION_ERRORS.malformed

  const { cities, specialties, availability, hasEquipment, notes } = raw

  if (
    !Array.isArray(cities) ||
    cities.length < 1 ||
    cities.length > SUPPORTED_CITIES.length ||
    !cities.every((city): city is string => typeof city === 'string' && isOperationalCity(city)) ||
    new Set(cities).size !== cities.length
  ) {
    return APPLICATION_ERRORS.cities
  }

  if (
    !Array.isArray(specialties) ||
    specialties.length < 1 ||
    specialties.length > inspectorSpecialties.length ||
    !specialties.every(
      (specialty): specialty is string =>
        typeof specialty === 'string' &&
        inspectorSpecialties.includes(specialty as (typeof inspectorSpecialties)[number]),
    ) ||
    new Set(specialties).size !== specialties.length
  ) {
    return APPLICATION_ERRORS.specialties
  }

  if (
    typeof availability !== 'string' ||
    !inspectorAvailabilities.includes(availability as (typeof inspectorAvailabilities)[number])
  ) {
    return APPLICATION_ERRORS.availability
  }

  if (typeof hasEquipment !== 'boolean') {
    return APPLICATION_ERRORS.hasEquipment
  }

  if (typeof notes !== 'string' || notes.length > NOTES_MAX) {
    return APPLICATION_ERRORS.notes
  }

  return null
}

/**
 * Validates and normalizes a raw JSON body into an `InspectorApplicationInput`.
 *
 * Composes the two step validators, so a rule can only be relaxed in one place.
 * Identity is checked first so the applicant is walked through the form in the
 * order the form presents it.
 */
export function parseInspectorApplication(raw: unknown): InspectorApplicationParse {
  if (!isPlainObject(raw)) return { ok: false, error: APPLICATION_ERRORS.malformed }

  const identityError = identityStepError(raw)
  if (identityError) return { ok: false, error: identityError }

  const coverageError = coverageStepError(raw)
  if (coverageError) return { ok: false, error: coverageError }

  // Both step validators passed, so the shape below is guaranteed. The cast is
  // the boundary where "validated `unknown`" becomes a typed value.
  const {
    fullName, nationalId, phone, age, experienceYears, experienceDetails,
    hasCertificates, qualification, cities, specialties, availability, hasEquipment, notes,
  } = raw as unknown as {
    fullName: string; nationalId: string; phone: string; age: number
    experienceYears: number; experienceDetails: string
    hasCertificates: boolean | null | undefined; qualification: string
    cities: string[]; specialties: string[]; availability: string
    hasEquipment: boolean; notes: string
  }

  return {
    ok: true,
    value: {
      fullName: fullName.trim(),
      nationalId: nationalId.trim(),
      phone: canonicalSaudiPhone(phone),
      age,
      experienceYears,
      experienceDetails: experienceDetails.trim(),
      // A "no" is recorded as `false`; an unanswered question stays `null`.
      hasCertificates: hasCertificates === undefined || hasCertificates === null ? null : hasCertificates,
      qualification: qualification.trim(),
      cities: [...cities],
      specialties: [...specialties],
      availability,
      hasEquipment,
      notes: notes.trim(),
    },
  }
}
