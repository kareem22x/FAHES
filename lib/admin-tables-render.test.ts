import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { InspectorsTable } from '@/components/admin/inspectors-table'
import { InspectorApplicationsTable } from '@/components/admin/inspector-applications-table'
import type { InspectorRosterRow } from '@/lib/inspector-roster'

/**
 * Render smoke tests for the two admin tables.
 *
 * These live in `lib/` because `vitest.config.mjs` pins
 * `include: ['lib/**\/*.test.ts']` — the config is what decides, not the subject
 * matter. The trade-off is worth it: a table that throws during render is
 * invisible to `tsc`, `eslint` and `next build`, because every admin page is
 * `force-dynamic` and therefore never prerendered. The only thing that ever
 * caught one was an operator opening the page.
 *
 * The server action is stubbed. Importing the real `@/lib/admin/actions` would
 * pull in `server-only` and `next/headers`, neither of which resolves outside a
 * request — and the action is not what is under test; the render is. `vi.mock`
 * is hoisted above the imports above, so the stub is in place before the tables
 * load their action.
 *
 * The imports are static rather than `await import(...)`: this file is checked
 * by the same `tsconfig.json` as the app, whose `target: ES6` rejects top-level
 * `await` (TS1378).
 */
vi.mock('@/lib/admin/actions', () => ({
  setInspectorStatusAction: async () => null,
}))

/**
 * Annotated rather than inferred. `inspectorStatus: 'approved'` widens to
 * `string` in an object literal, and the row type is the narrow union — so
 * without the annotation the literal is not assignable and `tsc` rejects the
 * render call.
 */
/** A row shaped like one a real inspector account produces. */
const inspectorRow: InspectorRosterRow = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'محمد عبدالله القحطاني',
  phone: '0512345678',
  role: 'inspector',
  inspectorStatus: 'approved',
  experienceYears: 7,
  availability: 'دوام كامل',
  cities: ['الدمام', 'الخبر'],
  specialties: ['فحص المحرك وناقل الحركة'],
  qualification: 'شهادة فحص مركبات',
  hasEquipment: true,
  notes: 'ملاحظة',
  hasApplication: true,
}

/** The same account before a decision — every application field still null. */
const bareInspectorRow: InspectorRosterRow = {
  ...inspectorRow,
  id: '22222222-2222-2222-2222-222222222222',
  inspectorStatus: 'none',
  experienceYears: null,
  availability: null,
  cities: [],
  specialties: [],
  qualification: null,
  hasEquipment: null,
  notes: null,
  hasApplication: false,
}

const applicationRow = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: '33333333-3333-3333-3333-333333333333',
  fullName: 'سعد ناصر الدوسري',
  accountName: 'سعد الدوسري',
  nationalId: '1234567890',
  phone: '0555555555',
  age: 29,
  experienceYears: 4,
  experienceDetails: 'أربع سنوات في فحص الهيكل والدهان.',
  hasCertificates: true,
  qualification: 'دورة ميكانيكا',
  cities: ['الخبر'],
  specialties: ['فحص الهيكل والدهان'],
  availability: 'دوام جزئي',
  hasEquipment: false,
  notes: '',
  submittedAt: '2026-10-06T17:00:00.000Z',
  inspectorStatus: 'pending',
}

describe('InspectorsTable', () => {
  it('renders an approved inspector', () => {
    const html = renderToString(createElement(InspectorsTable, { rows: [inspectorRow] }))
    expect(html).toContain('محمد عبدالله القحطاني')
    expect(html).toContain('اعتماد')
  })

  /**
   * Removal is the roster's only way off the list, and it is the operation that
   * used to be unreachable — `setInspectorStatus('none')` returned `null`, so
   * every attempt reported «المستخدم غير موجود أو محمي». The button must exist.
   */
  it('offers the removal control', () => {
    const html = renderToString(createElement(InspectorsTable, { rows: [inspectorRow] }))
    expect(html).toContain('إزالة')
  })

  it('renders an account with no application at all', () => {
    // The null-heavy shape: every application-derived column is absent.
    const html = renderToString(createElement(InspectorsTable, { rows: [bareInspectorRow] }))
    expect(html).toContain('محمد عبدالله القحطاني')
  })

  /** An account with no phone on file must not break the masked-phone cell. */
  it('renders an account with no phone on file', () => {
    const noPhone = { ...inspectorRow, phone: null }
    const html = renderToString(createElement(InspectorsTable, { rows: [noPhone] }))
    expect(html).toContain('غير مضاف')
  })

  it('renders an empty roster', () => {
    const html = renderToString(createElement(InspectorsTable, { rows: [] }))
    expect(html).toContain('لا يوجد فاحصون معتمدون بعد')
  })
})

describe('InspectorApplicationsTable', () => {
  it('renders a pending application with all identity fields', () => {
    const html = renderToString(createElement(InspectorApplicationsTable, { rows: [applicationRow] }))
    expect(html).toContain('سعد ناصر الدوسري')
    expect(html).toContain('1234567890')
    expect(html).toContain('0555555555')
    expect(html).toContain('دورة ميكانيكا')
  })

  it('renders an application that skipped the certificate question', () => {
    // `hasCertificates: null` is the tri-state "not answered" case.
    const skipped = { ...applicationRow, hasCertificates: null, qualification: '' }
    const html = renderToString(createElement(InspectorApplicationsTable, { rows: [skipped] }))
    expect(html).toContain('لم يُجب')
  })

  it('renders an application with no national ID or phone on file', () => {
    const sparse = { ...applicationRow, nationalId: null, phone: null, age: null }
    const html = renderToString(createElement(InspectorApplicationsTable, { rows: [sparse] }))
    expect(html).toContain('سعد ناصر الدوسري')
  })

  it('renders an empty inbox', () => {
    const html = renderToString(createElement(InspectorApplicationsTable, { rows: [] }))
    expect(html).toContain('لا توجد طلبات تقديم كفاحص بعد')
  })
})
