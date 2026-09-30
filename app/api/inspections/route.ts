import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { easternProvinceCities } from '@/lib/eastern-province'
import { acceptInspectionOffer, createInspection, listCustomerInspections, listOpenInspectionsForInspector } from '@/lib/inspection-store'
import { assertSameOrigin } from '@/lib/origin'
import { getUserById } from '@/lib/user-store'

const allowedServices = ['فحص شامل', 'فحص ميكانيكي', 'فحص هيكل وبوية', 'فحص كمبيوتر']

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

  const user = await getUserById(session.sub)
  if (!user || user.role !== 'inspector' || user.inspectorStatus !== 'approved') {
    return NextResponse.json({ error: 'هذه الصفحة للفاحصين المعتمدين فقط' }, { status: 403 })
  }

  const profile = user.inspectorProfile
  return NextResponse.json({
    inspections: await listOpenInspectionsForInspector(user.id, profile?.cities ?? []),
    isOnline: profile?.isOnline ?? false,
  })
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: 'سجّل الدخول كعميل لنشر طلب فحص' }, { status: 401 })
  }
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-create', session.sub, {
    user: 5,
    ip: 20,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }

  const payload = body as Record<string, unknown>
  const vehicle = payload.vehicle
  if (!vehicle || typeof vehicle !== 'object') {
    return NextResponse.json({ error: 'بيانات السيارة غير مكتملة' }, { status: 400 })
  }
  const car = vehicle as Record<string, unknown>
  const requiredStrings = [car.make, car.model, payload.city, payload.district, payload.address, payload.scheduledAt]
  if (requiredStrings.some((value) => typeof value !== 'string' || !value.trim())) {
    return NextResponse.json({ error: 'أكمل بيانات السيارة وموقعها وموعد الفحص' }, { status: 400 })
  }
  if (
    typeof car.make !== 'string' || car.make.trim().length > 60 ||
    typeof car.model !== 'string' || car.model.trim().length > 60 ||
    typeof car.year !== 'number' || !Number.isInteger(car.year) ||
    car.year < 1950 || car.year > new Date().getFullYear() + 1 ||
    typeof payload.city !== 'string' || !easternProvinceCities.includes(payload.city) ||
    typeof payload.district !== 'string' || payload.district.trim().length > 80 ||
    typeof payload.address !== 'string' || payload.address.trim().length > 240 ||
    typeof payload.scheduledAt !== 'string' || Number.isNaN(Date.parse(payload.scheduledAt)) ||
    Date.parse(payload.scheduledAt) < Date.now() - 60_000 ||
    !Array.isArray(payload.services) || payload.services.length === 0 ||
    payload.services.length > allowedServices.length ||
    !payload.services.every((item): item is string => typeof item === 'string' && allowedServices.includes(item)) ||
    new Set(payload.services).size !== payload.services.length ||
    (car.mileage !== null && car.mileage !== undefined &&
      (typeof car.mileage !== 'number' || !Number.isInteger(car.mileage) || car.mileage < 0 || car.mileage > 2_000_000)) ||
    (typeof payload.notes === 'string' && payload.notes.length > 1000)
  ) {
    return NextResponse.json({ error: 'تحقق من بيانات السيارة وموقعها وموعدها ونوع الفحص' }, { status: 400 })
  }

  const user = await getUserById(session.sub)
  if (!user) return NextResponse.json({ error: 'تعذر العثور على حساب العميل' }, { status: 401 })

  try {
    const inspection = await createInspection({
      customerId: user.id,
      vehicle: {
        make: car.make.trim(),
        model: car.model.trim(),
        year: car.year,
        mileage: typeof car.mileage === 'number' ? car.mileage : null,
        color: typeof car.color === 'string' ? car.color.trim().slice(0, 40) : '',
        vin: typeof car.vin === 'string' ? car.vin.trim().slice(0, 40) : '',
        plateNumber: typeof car.plateNumber === 'string' ? car.plateNumber.trim().slice(0, 20) : '',
      },
      city: payload.city,
      district: payload.district.trim(),
      address: payload.address.trim(),
      services: payload.services,
      scheduledAt: payload.scheduledAt,
      notes: typeof payload.notes === 'string' ? payload.notes.trim() : '',
    })
    return NextResponse.json({ success: true, inspectionId: inspection.id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'تعذر حفظ الطلب. حاول مرة أخرى' }, { status: 500 })
  }
}
