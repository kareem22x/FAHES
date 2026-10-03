import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { acceptInspectionOffer, listOpenInspectionsForInspector, submitInspectionOffer } from '@/lib/inspection-store'

const input = {
  inspectionId: 'FH-2026-ABC12345',
  inspectorId: 'edaf9a65-7c0c-48cf-a6cf-512344454555',
  inspectorName: 'فاحص معتمد',
  price: 250,
  note: 'فحص شامل',
  cities: ['الدمام'],
}

describe('Supabase inspection operations', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.from.mockReset()
    mocks.getSupabaseAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from })
  })

  it('submits offers through the atomic database operation and passes coverage cities', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'ok', offerId: 'b14eaacd-0d66-41ab-b6dd-7e24101ff999' }, error: null })

    await expect(submitInspectionOffer(input)).resolves.toEqual({
      offer: { id: 'b14eaacd-0d66-41ab-b6dd-7e24101ff999' },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('submit_inspection_offer', expect.objectContaining({
      p_inspection_id: input.inspectionId,
      p_inspector_id: input.inspectorId,
      p_cities: ['الدمام'],
    }))
  })

  it('returns the database conflict when an inspector already submitted an offer', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'duplicate' }, error: null })

    await expect(submitInspectionOffer(input)).resolves.toEqual({ error: 'duplicate' })
  })

  it('returns the accepted offer only after the database transition succeeds', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: 'ok',
        inspectorId: input.inspectorId,
        inspectorName: input.inspectorName,
        price: 250,
      },
      error: null,
    })
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.single.mockResolvedValue({
      data: {
        id: input.inspectionId,
        customer_id: '0d3c6d7b-a141-41a4-9264-ef79ab7b9faa',
        vehicle: {
          make: 'تويوتا',
          model: 'كامري',
          year: 2022,
          mileage: null,
          color: '',
          vin: '',
          plateNumber: '',
        },
        city: 'الدمام',
        district: 'الفيصلية',
        address: 'شارع الملك فهد',
        services: ['فحص شامل'],
        scheduled_at: '2026-10-01T10:00:00.000Z',
        notes: '',
        status: 'assigned',
        assigned_inspector_id: input.inspectorId,
        accepted_offer_id: 'b14eaacd-0d66-41ab-b6dd-7e24101ff999',
        created_at: '2026-09-30T10:00:00.000Z',
      },
      error: null,
    })
    mocks.from.mockReturnValue(query)

    const result = await acceptInspectionOffer({
      inspectionId: input.inspectionId,
      offerId: 'b14eaacd-0d66-41ab-b6dd-7e24101ff999',
      customerId: '0d3c6d7b-a141-41a4-9264-ef79ab7b9faa',
    })

    expect(result).toMatchObject({
      inspection: { status: 'assigned', assignedInspectorId: input.inspectorId },
      offer: { status: 'accepted', inspectorName: input.inspectorName, price: 250 },
    })
  })

  it('does not fetch inspection details when the customer is not authorized', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'forbidden' }, error: null })

    await expect(acceptInspectionOffer({
      inspectionId: input.inspectionId,
      offerId: 'b14eaacd-0d66-41ab-b6dd-7e24101ff999',
      customerId: '0d3c6d7b-a141-41a4-9264-ef79ab7b9faa',
    })).resolves.toEqual({ error: 'forbidden' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

/**
 * الرجوع لسبب الفشل — لا لكونه فشلًا فقط.
 *
 * الشكوى الأصلية كانت «الطلب لم يعد متاحًا» تظهر لطلب متاح فعلًا. السبب أن كل
 * النتائج غير الناجحة كانت تُسوَّى إلى نصّ واحد، فلم يستطع المستخدم ولا نحن
 * التمييز بين «سبقك فاحص» و«خارج مدنك» و«سبق أن قدّمت». هذه الاختبارات تثبّت
 * أن السبب يعبر من القاعدة إلى طبقة Node سليمًا.
 */
describe('offer failure reasons reach the caller intact', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.from.mockReset()
    mocks.getSupabaseAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from })
  })

  it('passes the real inspection status back when the request already left the open state', async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: 'closed', inspectionStatus: 'assigned' },
      error: null,
    })

    await expect(submitInspectionOffer(input)).resolves.toEqual({
      error: 'closed',
      inspectionStatus: 'assigned',
    })
  })

  it('keeps «closed» distinct from «not_found»', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null })

    const result = await submitInspectionOffer(input)
    expect(result).toMatchObject({ error: 'not_found' })
    expect(result).not.toMatchObject({ error: 'closed' })
  })

  it('reports an out-of-coverage request as forbidden rather than as unavailable', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'forbidden' }, error: null })

    await expect(submitInspectionOffer(input)).resolves.toEqual({ error: 'forbidden' })
  })

  it('never collapses an unknown outcome into a success', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'ok' }, error: null })

    await expect(submitInspectionOffer(input)).resolves.toEqual({
      error: 'ok',
      inspectionStatus: undefined,
    })
  })
})

/**
 * المدن مصدرها القاعدة لا الذاكرة.
 *
 * كان الاستعلام يمرّر `cities` القادمة من الكائن المحمّل في الجلسة، فتختلف عن
 * القاعدة إن غيّر الفاحص مدنه في تبويب آخر. الدالة الجديدة تقرأ المدن من
 * القاعدة داخل الاستعلام نفسه؛ التوقيع يبقى يحمل `cities` للمسار الاحتياطي
 * وحده. هذا الاختبار يثبّت أن النداء الأساسي لا يعتمد عليها.
 */
describe('eligible inspections are filtered in the database', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.from.mockReset()
    mocks.getSupabaseAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from })
  })

  it('prefers the database function and does not scan the table when it exists', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })

    await listOpenInspectionsForInspector(input.inspectorId, ['مدينة-قديمة-في-الذاكرة'])

    expect(mocks.rpc).toHaveBeenCalledWith('list_eligible_inspections', {
      p_inspector_id: input.inspectorId,
      p_limit: 200,
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('falls back to the scoped query when the migration is not applied yet', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.list_eligible_inspections' },
    })
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), neq: vi.fn(), order: vi.fn(), limit: vi.fn() }
    for (const key of ['select', 'eq', 'in', 'neq', 'order', 'limit'] as const) {
      query[key].mockReturnValue(query)
    }
    query.limit.mockResolvedValue({ data: [], error: null })
    mocks.from.mockReturnValue(query)

    await expect(listOpenInspectionsForInspector(input.inspectorId, ['الدمام'])).resolves.toEqual([])
    expect(mocks.from).toHaveBeenCalledWith('inspections')
    expect(query.in).toHaveBeenCalledWith('city', ['الدمام'])
  })

  it('does not swallow a genuine database failure', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    })

    await expect(listOpenInspectionsForInspector(input.inspectorId, ['الدمام'])).rejects.toThrow(
      /statement timeout/,
    )
  })
})
