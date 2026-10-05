import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { isOperationalCity, SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import {
  inspectorAvailabilities,
  inspectorSpecialties,
  type InspectorApplicationInput,
} from '@/types/domain'
import { SupabaseInspectorApplicationsMigrationRequiredError } from '@/lib/supabase/server'
import { getUserById, saveNationalId, submitInspectorApplication } from '@/lib/user-store'

const WEEKLY_VOLUME_OPTIONS = [
  '1-5 فحوصات',
  '6-10 فحوصات',
  '11-20 فحصًا',
  '21-50 فحصًا',
  'أكثر من 50 فحصًا',
] as const

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

  if (!session.phone) {
    return NextResponse.json(
      { error: 'أضف رقم جوال موثّق إلى حسابك قبل طلب الانضمام كفاحص' },
      { status: 400 },
    )
  }

  const rateLimitResponse = await enforceApiRateLimit(request, 'inspector-register', session.sub, {
    user: 5,
    ip: 10,
    windowMs: 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  // --- eligibility (same guard logic as /api/inspectors/apply) ---
  const applicant = await getUserById(session.sub)
  if (!applicant || applicant.role === 'admin') {
    return NextResponse.json({ error: 'هذا الحساب غير مؤهل للتقديم كفاحص' }, { status: 403 })
  }
  if (applicant.inspectorStatus === 'approved') {
    return NextResponse.json(
      { error: 'حسابك معتمد بالفعل. يمكنك الانتقال إلى لوحة الفاحص.' },
      { status: 409 },
    )
  }
  if (applicant.inspectorStatus === 'suspended') {
    return NextResponse.json(
      { error: 'لا يمكن إرسال طلب جديد لهذا الحساب حاليًا.' },
      { status: 409 },
    )
  }

  // --- parse ---
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const {
    nationalId,
    fullName,
    workCities,
    experienceYears,
    specialties,
    availability,
    hasEquipment,
    qualification,
    vehicleTypes,
    previousWork,
    weeklyVolume,
    tamperingHandling,
    additionalInfo,
  } = input

  // --- validate ---
  if (typeof nationalId !== 'string' || !/^[12][0-9]{9}$/.test(nationalId.trim())) {
    return NextResponse.json(
      { error: 'رقم الهوية يجب أن يكون 10 أرقام سعودية (يبدأ بـ 1 أو 2).' },
      { status: 400 },
    )
  }
  if (typeof fullName !== 'string' || fullName.trim().length < 3 || fullName.trim().length > 80) {
    return NextResponse.json({ error: 'الاسم الثلاثي مطلوب (3 إلى 80 حرفًا).' }, { status: 400 })
  }
  if (
    !Array.isArray(workCities) ||
    workCities.length < 1 ||
    workCities.length > SUPPORTED_CITIES.length ||
    !workCities.every((c): c is string => typeof c === 'string' && isOperationalCity(c)) ||
    new Set(workCities).size !== workCities.length
  ) {
    return NextResponse.json(
      { error: 'اختر مدينة عمل واحدة على الأقل من المدن المتاحة.' },
      { status: 400 },
    )
  }
  if (
    typeof experienceYears !== 'number' ||
    !Number.isInteger(experienceYears) ||
    experienceYears < 0 ||
    experienceYears > 60
  ) {
    return NextResponse.json({ error: 'حدد عدد سنوات الخبرة.' }, { status: 400 })
  }
  if (
    !Array.isArray(specialties) ||
    specialties.length < 1 ||
    specialties.length > inspectorSpecialties.length ||
    !specialties.every(
      (s): s is string =>
        typeof s === 'string' &&
        inspectorSpecialties.includes(s as (typeof inspectorSpecialties)[number]),
    ) ||
    new Set(specialties).size !== specialties.length
  ) {
    return NextResponse.json({ error: 'اختر مجال خبرة واحدًا على الأقل.' }, { status: 400 })
  }
  if (
    typeof availability !== 'string' ||
    !inspectorAvailabilities.includes(availability as (typeof inspectorAvailabilities)[number])
  ) {
    return NextResponse.json({ error: 'حدد نوع التفرغ المناسب لك.' }, { status: 400 })
  }
  if (typeof hasEquipment !== 'boolean') {
    return NextResponse.json({ error: 'حدد ما إذا كانت معدات الفحص متوفرة لديك.' }, { status: 400 })
  }
  if (typeof qualification !== 'string' || qualification.length > 180) {
    return NextResponse.json({ error: 'حقل الشهادات غير صالح.' }, { status: 400 })
  }
  if (typeof vehicleTypes !== 'string' || vehicleTypes.length > 200) {
    return NextResponse.json({ error: 'حقل أنواع السيارات غير صالح.' }, { status: 400 })
  }
  if (typeof previousWork !== 'string' || previousWork.length > 300) {
    return NextResponse.json({ error: 'حقل العمل السابق غير صالح.' }, { status: 400 })
  }
  if (
    typeof weeklyVolume !== 'string' ||
    !WEEKLY_VOLUME_OPTIONS.includes(weeklyVolume as (typeof WEEKLY_VOLUME_OPTIONS)[number])
  ) {
    return NextResponse.json({ error: 'حدد حجم العمل الأسبوعي.' }, { status: 400 })
  }
  if (typeof tamperingHandling !== 'string' || tamperingHandling.length > 400) {
    return NextResponse.json({ error: 'حقل التعامل مع التلاعب غير صالح.' }, { status: 400 })
  }
  if (typeof additionalInfo !== 'string' || additionalInfo.length > 400) {
    return NextResponse.json({ error: 'حقل المعلومات الإضافية غير صالح.' }, { status: 400 })
  }

  // --- 1) save national ID ---
  const nationalIdResult = await saveNationalId(session.sub, nationalId.trim())
  if (!nationalIdResult.ok) {
    if (nationalIdResult.reason === 'duplicate') {
      return NextResponse.json(
        { error: 'رقم الهوية مرتبط بحساب آخر. تواصل مع الدعم للمساعدة.' },
        { status: 409 },
      )
    }
    if (nationalIdResult.reason === 'not_found') {
      return NextResponse.json({ error: 'الحساب غير موجود.' }, { status: 404 })
    }
    return NextResponse.json({ error: 'رقم الهوية غير صالح.' }, { status: 400 })
  }

  // --- 2) build notes from extra questionnaire answers ---
  const notesParts: string[] = []
  if (vehicleTypes.trim()) notesParts.push(`أنواع السيارات: ${vehicleTypes.trim()}`)
  if (previousWork.trim()) notesParts.push(`العمل السابق: ${previousWork.trim()}`)
  if (weeklyVolume) notesParts.push(`الحجم الأسبوعي: ${weeklyVolume}`)
  if (tamperingHandling.trim()) notesParts.push(`التعامل مع التلاعب: ${tamperingHandling.trim()}`)
  if (additionalInfo.trim()) notesParts.push(`معلومات إضافية: ${additionalInfo.trim()}`)
  const notes = notesParts.join('\n').slice(0, 1000)

  // --- 3) submit inspector application ---
  const application: InspectorApplicationInput = {
    experienceYears,
    cities: workCities,
    specialties,
    qualification: qualification.trim(),
    availability,
    hasEquipment,
    notes,
  }

  try {
    const user = await submitInspectorApplication(session.sub, application)
    if (!user) return NextResponse.json({ error: 'تعذر تقديم الطلب' }, { status: 400 })
    return NextResponse.json({ success: true, inspectorStatus: user.inspectorStatus })
  } catch (error) {
    if (error instanceof SupabaseInspectorApplicationsMigrationRequiredError) {
      return NextResponse.json(
        {
          error:
            'يلزم تحديث قاعدة البيانات أولًا بتشغيل supabase/migrations/20260930180200_inspector_applications.sql',
        },
        { status: 503 },
      )
    }
    throw error
  }
}
