export type Role = 'customer' | 'inspector' | 'admin' | 'admin_pending'
export type InspectorStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'suspended'

export const inspectorSpecialties = [
  'فحص المحرك وناقل الحركة',
  'فحص الهيكل والدهان',
  'الفحص الكهربائي والإلكتروني',
  'فحص أنظمة التعليق والفرامل',
  'فحص السيارات الهجينة والكهربائية',
] as const

export const inspectorAvailabilities = ['دوام كامل', 'دوام جزئي', 'حسب المواعيد'] as const

/**
 * What an inspector applicant submits — two steps, one payload.
 *
 * Step 1 (identity):    fullName · nationalId · phone · age ·
 *                       experienceYears + experienceDetails · hasCertificates/qualification
 * Step 2 (coverage):    cities · specialties · availability · hasEquipment
 *
 * `hasCertificates` is tri-state on purpose: `true` / `false` / `null` means the
 * applicant skipped the question, which the form allows. Collapsing `null` into
 * `false` would record a "no" nobody said.
 */
export type InspectorApplicationInput = {
  fullName: string
  nationalId: string
  phone: string
  age: number
  experienceYears: number
  experienceDetails: string
  hasCertificates: boolean | null
  qualification: string
  cities: string[]
  specialties: string[]
  availability: string
  hasEquipment: boolean
  notes: string
}

export type InspectorApplicationRow = {
  user_id: string
  full_name: string
  national_id: string | null
  phone: string | null
  age: number | null
  experience_years: number
  experience_details: string
  has_certificates: boolean | null
  qualification: string
  cities: string[]
  specialties: string[]
  availability: string
  has_equipment: boolean
  notes: string
  submitted_at: string
}

export type AppUser = {
  id: string
  clerkUserId: string | null
  phone: string | null
  name: string
  role: Exclude<Role, 'admin_pending'>
  inspectorStatus: InspectorStatus
  nationalId: string | null
  nationalIdVerifiedAt: number | null
  isVerified: boolean
  /**
   * Whether the phone on this account has been confirmed — the single flag the
   * route gatekeeper (`proxy.ts`) checks before admitting a signed-in user to
   * `/inspector`, `/admin` or `/dashboard`.
   *
   * Distinct from `isVerified`, which additionally requires a national ID and
   * only ever applies to customers.
   */
  phoneVerified: boolean
  phoneVerifiedAt: number | null
  inspectorProfile?: {
    isOnline: boolean
    cities: string[]
    updatedAt: number
  }
  createdAt: number
  lastLoginAt: number
}
