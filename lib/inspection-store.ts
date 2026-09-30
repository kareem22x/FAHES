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
  input: Omit<StoredInspection, 'id' | 'status' | 'assignedInspectorId' | 'acceptedOfferId' | 'offers' | 'createdAt'>,
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

export async function listOpenInspectionsForInspector(inspectorId: string, cities: string[]) {
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

  const inspections = await mapInspections(data ?? [])
  return inspections.map(({ customerId: _customerId, offers, ...inspection }) => ({
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

function resultRecord(value: Json) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Supabase returned an invalid inspection operation result')
  }
  return value
}

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
    return { error: typeof result.status === 'string' ? result.status : 'unknown' } as const
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
