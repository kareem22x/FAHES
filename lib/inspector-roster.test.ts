import { describe, expect, it } from 'vitest'
import { buildInspectorRoster, isRosterMember } from '@/lib/inspector-roster'
import type { AppUser, InspectorApplicationRow, InspectorStatus } from '@/types/domain'

function user(overrides: Partial<AppUser> & { id: string }): AppUser {
  return {
    clerkUserId: null,
    phone: '0512345678',
    name: 'حساب',
    role: 'customer',
    inspectorStatus: 'none',
    nationalId: null,
    nationalIdVerifiedAt: null,
    isVerified: false,
    phoneVerified: true,
    phoneVerifiedAt: null,
    createdAt: 0,
    lastLoginAt: 0,
    ...overrides,
  }
}

function application(overrides: Partial<InspectorApplicationRow> & { user_id: string }): InspectorApplicationRow {
  return {
    full_name: 'محمد عبدالله القحطاني',
    national_id: '1234567890',
    phone: '0512345678',
    age: 34,
    experience_years: 7,
    experience_details: 'سبع سنوات في فحص الهيكل.',
    has_certificates: true,
    qualification: 'شهادة فحص مركبات',
    cities: ['الدمام', 'الخبر'],
    specialties: ['فحص المحرك وناقل الحركة'],
    availability: 'دوام كامل',
    has_equipment: true,
    notes: '',
    submitted_at: '2026-10-06T17:00:00.000Z',
    ...overrides,
  }
}

describe('isRosterMember', () => {
  /**
   * The regression this module exists for. The platform owner's account is
   * `role = 'admin'` with `inspector_status = 'approved'` — the status that
   * opens the owner's inspector surface. It must not become a roster row: the
   * decision actions refuse admins by design, so the row would carry three
   * buttons that can never succeed.
   */
  it('excludes the platform owner even though their inspector status is approved', () => {
    const owner = user({ id: 'owner', role: 'admin', inspectorStatus: 'approved' })
    expect(isRosterMember(owner)).toBe(false)
    expect(buildInspectorRoster([owner], [])).toEqual([])
  })

  it('excludes any admin, whatever the inspector status', () => {
    const statuses: InspectorStatus[] = ['none', 'pending', 'approved', 'rejected', 'suspended']
    for (const inspectorStatus of statuses) {
      expect(isRosterMember(user({ id: 'a', role: 'admin', inspectorStatus }))).toBe(false)
    }
  })

  /** A pending applicant is not yet an inspector — that decision lives in the inbox. */
  it('excludes pending applicants, who belong to the intake inbox', () => {
    expect(isRosterMember(user({ id: 'p', role: 'customer', inspectorStatus: 'pending' }))).toBe(false)
  })

  it('excludes a plain customer', () => {
    expect(isRosterMember(user({ id: 'c', role: 'customer', inspectorStatus: 'none' }))).toBe(false)
  })

  it('includes an approved inspector', () => {
    expect(isRosterMember(user({ id: 'i', role: 'inspector', inspectorStatus: 'approved' }))).toBe(true)
  })

  /** Rejected and suspended accounts stay listed so they can be reconsidered. */
  it('includes rejected and suspended accounts', () => {
    expect(isRosterMember(user({ id: 'r', role: 'customer', inspectorStatus: 'rejected' }))).toBe(true)
    expect(isRosterMember(user({ id: 's', role: 'customer', inspectorStatus: 'suspended' }))).toBe(true)
  })
})

describe('buildInspectorRoster', () => {
  it('merges the application onto the account', () => {
    const rows = buildInspectorRoster(
      [user({ id: 'i1', name: 'محمد القحطاني', role: 'inspector', inspectorStatus: 'approved' })],
      [application({ user_id: 'i1' })],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'i1',
      name: 'محمد القحطاني',
      inspectorStatus: 'approved',
      experienceYears: 7,
      availability: 'دوام كامل',
      cities: ['الدمام', 'الخبر'],
      specialties: ['فحص المحرك وناقل الحركة'],
      qualification: 'شهادة فحص مركبات',
      hasEquipment: true,
      hasApplication: true,
    })
  })

  /**
   * A decision can precede the paperwork: an operator may approve an account
   * that has no application row at all. The row must still render rather than
   * throwing on a missing application.
   */
  it('renders a decided account that has no application row', () => {
    const rows = buildInspectorRoster(
      [user({ id: 'i2', role: 'inspector', inspectorStatus: 'approved', inspectorProfile: undefined })],
      [],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      experienceYears: null,
      availability: null,
      cities: [],
      specialties: [],
      qualification: null,
      hasEquipment: null,
      notes: null,
      hasApplication: false,
    })
  })

  /** With no application, the coverage cities come from the inspector profile. */
  it('falls back to the inspector profile cities', () => {
    const rows = buildInspectorRoster(
      [
        user({
          id: 'i3',
          role: 'inspector',
          inspectorStatus: 'approved',
          inspectorProfile: { isOnline: false, cities: ['جدة'], updatedAt: 0 },
        }),
      ],
      [],
    )

    expect(rows[0].cities).toEqual(['جدة'])
  })

  it('prefers the application cities over the profile', () => {
    const rows = buildInspectorRoster(
      [
        user({
          id: 'i4',
          role: 'inspector',
          inspectorStatus: 'approved',
          inspectorProfile: { isOnline: false, cities: ['جدة'], updatedAt: 0 },
        }),
      ],
      [application({ user_id: 'i4', cities: ['الدمام'] })],
    )

    expect(rows[0].cities).toEqual(['الدمام'])
  })

  it('keeps roster order and drops everyone else', () => {
    const users = [
      user({ id: 'owner', name: 'المالك', role: 'admin', inspectorStatus: 'approved' }),
      user({ id: 'i1', name: 'أول', role: 'inspector', inspectorStatus: 'approved' }),
      user({ id: 'p1', name: 'بانتظار', role: 'customer', inspectorStatus: 'pending' }),
      user({ id: 'i2', name: 'ثاني', role: 'customer', inspectorStatus: 'suspended' }),
      user({ id: 'c1', name: 'عميل', role: 'customer', inspectorStatus: 'none' }),
    ]

    const rows = buildInspectorRoster(users, [])

    expect(rows.map((row) => row.name)).toEqual(['أول', 'ثاني'])
  })

  it('returns an empty roster when nobody has been decided', () => {
    expect(buildInspectorRoster([user({ id: 'c1' })], [])).toEqual([])
  })

  it('ignores an application belonging to an account that is not on the roster', () => {
    const rows = buildInspectorRoster([user({ id: 'owner', role: 'admin', inspectorStatus: 'approved' })], [
      application({ user_id: 'owner' }),
    ])

    expect(rows).toEqual([])
  })
})
