import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { InspectionOfferRow, InspectionRow, Json } from '@/lib/supabase/database.types'
import { randomId } from '@/lib/web-crypto'

export type InspectionStatus = 'open' | 'assigned' | 'on_the_way' | 'arrived' | 'inspecting' | 'completed' | 'cancelled'
export type OfferStatus = 'pending' | 'accepted' | 'declined'

export type InspectionOffer = {
  id: string
  inspectorId: string
  inspectorName: string
  price: number
  note: string
  status: OfferStatus
  createdAt: number
}

export type StoredInspection = {
  id: string
  customerId: string
  vehicle: {
    make: string
    model: string
    year: number
    mileage: number | null
    color: string
    vin: string
    plateNumber: string
  }
  city: string
  district: string
  address: string
  services: string[]
  scheduledAt: string
  notes: string
  termsVersion: string
  termsAcceptedAt: string | null
  status: InspectionStatus
  assignedInspectorId: string | null
  acceptedOfferId: string | null
  offers: InspectionOffer[]
  createdAt: number
}

type InspectionForInspector = Omit<StoredInspection, 'customerId' | 'offers'> & {
  myOffer: InspectionOffer | null
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(`Supabase inspection operation failed: ${error.message}`)
}

/**
 * هل فشل نداء RPC لأن الدالة نفسها غير موجودة في مخطط القاعدة؟
 *
 * هذا يحدث حين يكون الترحيل الذي ينشئ الدالة لم يُطبَّق بعد. PostgREST يعيد
 * `PGRST202` («Could not find the function … in the schema cache»). نتحقّق
 * أيضًا من نصّ الرسالة لأن بعض إصدارات PostgREST تعيد `42883`
 * (`undefined_function`) بدلًا منها، ولأن مطابقة الكود وحده قد تُخفي فشلًا
 * حقيقيًا من نوع آخر.
 *
 * نفس النهج المستخدم في `lib/user-store.ts` و`lib/inspector-device-store.ts`
 * — أُبقي محليًا هنا لتفادي استيراد يشجّع على تخطّي الأخطاء الحقيقية.
 */
function rpcMissing(error: { code?: string; message: string }): boolean {
  if (error.code === 'PGRST202' || error.code === '42883') return true
  const message = error.message.toLowerCase()
  return message.includes('could not find the function') || message.includes('does not exist')
}

function toRecord(value: Json): { [key: string]: Json | undefined } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored vehicle data has an invalid shape')
  }
  return value
}

function toVehicle(value: Json): StoredInspection['vehicle'] {
  const vehicle = toRecord(value)
  if (
    typeof vehicle.make !== 'string' ||
    typeof vehicle.model !== 'string' ||
    typeof vehicle.year !== 'number' ||
    (vehicle.mileage !== null && typeof vehicle.mileage !== 'number') ||
    typeof vehicle.color !== 'string' ||
    typeof vehicle.vin !== 'string' ||
    typeof vehicle.plateNumber !== 'string'
  ) {
    throw new Error('Stored vehicle data has an invalid shape')
  }
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    mileage: vehicle.mileage,
    color: vehicle.color,
    vin: vehicle.vin,
    plateNumber: vehicle.plateNumber,
  }
}

function toOffer(row: InspectionOfferRow): InspectionOffer {
  return {
    id: row.id,
    inspectorId: row.inspector_id,
    inspectorName: row.inspector_name,
    price: Number(row.price),
    note: row.note,
    status: row.status,
    createdAt: Date.parse(row.created_at),
  }
}

function toInspection(row: InspectionRow, offers: InspectionOffer[] = []): StoredInspection {
  return {
    id: row.id,
    customerId: row.customer_id,
    vehicle: toVehicle(row.vehicle),
    city: row.city,
    district: row.district,
    address: row.address,
    services: row.services,
    scheduledAt: row.scheduled_at,
    notes: row.notes,
    termsVersion: row.terms_version ?? '',
    termsAcceptedAt: row.terms_accepted_at,
    status: row.status,
    assignedInspectorId: row.assigned_inspector_id,
    acceptedOfferId: row.accepted_offer_id,
    offers,
    createdAt: Date.parse(row.created_at),
  }
}

async function listOffers(inspectionIds: string[]) {
  if (inspectionIds.length === 0) return new Map<string, InspectionOffer[]>()
  const { data, error } = await getSupabaseAdmin()
    .from('inspection_offers')
    .select('*')
    .in('inspection_id', inspectionIds)
    .order('created_at', { ascending: true })
  throwIfError(error)

  const result = new Map<string, InspectionOffer[]>()
  for (const row of data ?? []) {
    const offers = result.get(row.inspection_id) ?? []
    offers.push(toOffer(row))
    result.set(row.inspection_id, offers)
  }
  return result
}

async function mapInspections(rows: InspectionRow[]) {
  const offersByInspection = await listOffers(rows.map((row) => row.id))
  return rows.map((row) => toInspection(row, offersByInspection.get(row.id) ?? []))
}

export async function createInspection(
  input: Omit<StoredInspection, 'id' | 'status' | 'assignedInspectorId' | 'acceptedOfferId' | 'offers' | 'createdAt' | 'termsAcceptedAt'>,
) {
  const row = {
    id: `FH-${new Date().getFullYear()}-${randomId().slice(0, 8).toUpperCase()}`,
    customer_id: input.customerId,
    vehicle: input.vehicle,
    city: input.city,
    district: input.district,
    address: input.address,
    services: input.services,
    scheduled_at: input.scheduledAt,
    notes: input.notes,
    terms_version: input.termsVersion,
    terms_accepted_at: new Date().toISOString(),
  }
  const { data, error } = await getSupabaseAdmin()
    .from('inspections')
    .insert(row)
    .select('*')
    .single()
  throwIfError(error)
  if (!data) throw new Error('Supabase did not return the created inspection')
  return toInspection(data)
}

/**
 * الطلبات المفتوحة المتاحة لهذا الفاحص.
 *
 * ── لماذا هذا صار RPC بدل استعلام مباشر ─────────────────────────────────────
 *
 * كان الاستعلام `.eq('status','open').in('city', cities)` — يقرأ مدن التغطية من
 * الكائن الذي في الذاكرة. ومصدر تلك القائمة هو `user.inspectorProfile.cities`
 * المقروء من `user_profiles`، لكن **الواجهة والفاحص قد يختلفان لحظةً**: فاحص
 * يفتح تبويبين، يغيّر مدنه في أحدهما، ثم يقدّم عرضًا من الآخر بقائمة قديمة.
 * النتيجة رسالة «الطلب غير متاح في مدن عملك» لطلب هو في مدنه فعلًا.
 *
 * `list_eligible_inspections` تقرأ المدن من القاعدة داخل الاستعلام نفسه، فلا
 * توجد نافذة يختلف فيها المصدران. وهي أيضًا ترشّح بـ`city = any(array)` عبر
 * فهرس، بدل جلب كل الطلبات المفتوحة ثم ترشيحها في الذاكرة.
 *
 * ── التراجع الآمن ───────────────────────────────────────────────────────────
 *
 * إن لم يكن ترحيل `20261001000012` مُطبَّقًا بعد، تسقط الدالة إلى المسار القديم
 * بدل أن ترمي. المتغير `cities` يبقى في التوقيع لهذا السبب وحده.
 */
export async function listOpenInspectionsForInspector(inspectorId: string, cities: string[]) {
  const viaRpc = await getSupabaseAdmin().rpc('list_eligible_inspections', {
    p_inspector_id: inspectorId,
    p_limit: 200,
  })

  if (!viaRpc.error) {
    const inspections = await mapInspections((viaRpc.data ?? []) as InspectionRow[])
    return inspections.map(({ customerId: _customerId, offers, ...inspection }) => ({
      ...inspection,
      myOffer: offers.find((offer) => offer.inspectorId === inspectorId) ?? null,
    }))
  }

  // المسار القديم. يُبلَّغ عنه مرة واحدة ليكون واضحًا أن الترحيل ناقص.
  if (!rpcMissing(viaRpc.error)) throwIfError(viaRpc.error)
  console.warn(
    '[inspections] list_eligible_inspections غير موجودة — شغّل ترحيل 20261001000012. ' +
    'النتائج الآن غير مرشَّحة داخل القاعدة وقد تكون أبطأ أو تعرض طلبات خارج نطاق المدن.',
  )
  if (cities.length === 0) return []
  const { data, error } = await getSupabaseAdmin()
    .from('inspections')
    .select('*')
    .eq('status', 'open')
    .in('city', cities)
    .neq('customer_id', inspectorId)
    .order('scheduled_at', { ascending: true })
    .limit(200)
  throwIfError(error)

  const fallback = await mapInspections(data ?? [])
  return fallback.map(({ customerId: _customerId, offers, ...inspection }) => ({
    ...inspection,
    myOffer: offers.find((offer) => offer.inspectorId === inspectorId) ?? null,
  }))
}

export async function listAssignedInspectionsForInspector(inspectorId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspections')
    .select('*')
    .eq('assigned_inspector_id', inspectorId)
    .in('status', ['assigned', 'on_the_way', 'arrived', 'inspecting'])
    .order('scheduled_at', { ascending: true })
    .limit(200)
  throwIfError(error)

  const inspections = await mapInspections(data ?? [])
  return inspections.map(({ customerId: _customerId, offers, ...inspection }) => ({
    ...inspection,
    myOffer: offers.find((offer) => offer.inspectorId === inspectorId) ?? null,
  }))
}

export async function listCompletedInspectionsForInspector(inspectorId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspections')
    .select('*')
    .eq('assigned_inspector_id', inspectorId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(200)
  throwIfError(error)

  const inspections = await mapInspections(data ?? [])
  return inspections.map(({ customerId: _customerId, offers, ...inspection }) => ({
    ...inspection,
    myOffer: offers.find((offer) => offer.inspectorId === inspectorId) ?? null,
  }))
}

export async function getInspectorInspection(
  inspectionId: string,
  inspectorId: string,
  cities: string[],
): Promise<InspectionForInspector | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('inspections')
    .select('*')
    .eq('id', inspectionId)
    .maybeSingle()
  throwIfError(error)
  if (!data) return null

  const canViewOpenRequest =
    data.status === 'open' &&
    data.customer_id !== inspectorId &&
    cities.includes(data.city)
  const isAssignedInspector = data.assigned_inspector_id === inspectorId
  if (!canViewOpenRequest && !isAssignedInspector) return null

  const inspections = await mapInspections([data])
  const { customerId: _customerId, offers, ...inspection } = inspections[0]
  return {
    ...inspection,
    myOffer: offers.find((offer) => offer.inspectorId === inspectorId) ?? null,
  }
}

export async function listCustomerInspections(customerId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('inspections')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(200)
  throwIfError(error)
  return mapInspections(data ?? [])
}

/**
 * Every request on the platform, for the admin console. Optionally narrowed to
 * a single status. Ordered newest-first because the panel is used to spot what
 * just happened, not to browse history.
 */
export async function listAllInspections(status?: InspectionStatus) {
  let query = getSupabaseAdmin().from('inspections').select('*')
  if (status) query = query.eq('status', status)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(300)
  throwIfError(error)
  return mapInspections(data ?? [])
}

/**
 * Admin-initiated cancellation. Only live requests can be cancelled — a
 * completed inspection is a delivered product and must not be erased. Any
 * still-pending offer on the request is declined in the same breath so the
 * offers table never keeps a dangling bid against a dead request.
 *
 * Returns the previous status alongside the row so the caller can write an
 * accurate audit entry.
 */
export async function cancelInspectionByAdmin(inspectionId: string) {
  const db = getSupabaseAdmin()
  const cancellable: InspectionStatus[] = ['open', 'assigned', 'on_the_way', 'arrived', 'inspecting']

  const { data: current, error: readError } = await db
    .from('inspections')
    .select('*')
    .eq('id', inspectionId)
    .maybeSingle()
  throwIfError(readError)
  if (!current || !cancellable.includes(current.status)) return null

  const { data, error } = await db
    .from('inspections')
    .update({ status: 'cancelled' })
    .eq('id', inspectionId)
    .select('*')
    .maybeSingle()
  throwIfError(error)
  if (!data) return null

  const { error: offersError } = await db
    .from('inspection_offers')
    .update({ status: 'declined' })
    .eq('inspection_id', inspectionId)
    .eq('status', 'pending')
  throwIfError(offersError)

  return { inspection: toInspection(data), previousStatus: current.status }
}

function resultRecord(value: Json) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Supabase returned an invalid inspection operation result')
  }
  return value
}

/**
 * تقديم عرض على طلب فحص.
 *
 * الحالة النهائية تأتي من دالة القاعدة وحدها — لا من قائمة محسوبة في Node.
 * لذلك نُمرّر `inspectionStatus` (الحالة الحقيقية للطلب عند لحظة القفل) إلى
 * المستدعي، ليفرّق في الرسالة بين «سبقك فاحص آخر» و«خارج مدنك» و«سبق أن
 * قدّمت». هذا ما يُلغي رسالة «الطلب لم يعد متاحًا» العامّة.
 */
export async function submitInspectionOffer(input: {
  inspectionId: string
  inspectorId: string
  inspectorName: string
  price: number
  note: string
  cities: string[]
}) {
  const { data, error } = await getSupabaseAdmin().rpc('submit_inspection_offer', {
    p_inspection_id: input.inspectionId,
    p_inspector_id: input.inspectorId,
    p_inspector_name: input.inspectorName,
    p_price: input.price,
    p_note: input.note,
    p_cities: input.cities,
  })
  throwIfError(error)
  const result = resultRecord(data)
  if (result.status !== 'ok' || typeof result.offerId !== 'string') {
    return {
      error: typeof result.status === 'string' ? result.status : 'unknown',
      inspectionStatus: typeof result.inspectionStatus === 'string' ? result.inspectionStatus : undefined,
    } as const
  }
  return { offer: { id: result.offerId } } as const
}

export async function acceptInspectionOffer(input: {
  inspectionId: string
  offerId: string
  customerId: string
}) {
  const { data, error } = await getSupabaseAdmin().rpc('accept_inspection_offer', {
    p_inspection_id: input.inspectionId,
    p_offer_id: input.offerId,
    p_customer_id: input.customerId,
  })
  throwIfError(error)
  const result = resultRecord(data)
  if (
    result.status !== 'ok' ||
    typeof result.inspectorId !== 'string' ||
    typeof result.inspectorName !== 'string' ||
    typeof result.price !== 'number'
  ) {
    return { error: typeof result.status === 'string' ? result.status : 'unknown' } as const
  }

  const { data: inspectionRow, error: inspectionError } = await getSupabaseAdmin()
    .from('inspections')
    .select('*')
    .eq('id', input.inspectionId)
    .single()
  throwIfError(inspectionError)
  if (!inspectionRow) throw new Error('Supabase did not return the accepted inspection')
  const inspection = toInspection(inspectionRow, [{
    id: input.offerId,
    inspectorId: result.inspectorId,
    inspectorName: result.inspectorName,
    price: result.price,
    note: '',
    status: 'accepted',
    createdAt: Date.now(),
  }])
  return { inspection, offer: inspection.offers[0] } as const
}
