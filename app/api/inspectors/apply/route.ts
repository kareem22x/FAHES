import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { easternProvinceCities } from '@/lib/eastern-province'
import { inspectorAvailabilities, inspectorSpecialties, type InspectorApplicationInput } from '@/lib/types'
import { SupabaseInspectorApplicationsMigrationRequiredError } from '@/lib/supabase/server'
import { getUserById, submitInspectorApplication } from '@/lib/user-store'

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

  if (!session.phone) {
    return NextResponse.json({ error: 'أضف رقم جوال موثّق إلى حسابك قبل طلب الانضمام كفاحص' }, { status: 400 })
  }

  const applicant = await getUserById(session.sub)
  if (!applicant || applicant.role === 'admin') {
    return NextResponse.json({ error: 'هذا الحساب غير مؤهل للتقديم كفاحص' }, { status: 403 })
  }
  if (applicant.inspectorStatus === 'approved') {
    return NextResponse.json({ error: 'حسابك معتمد بالفعل. يمكنك الانتقال إلى لوحة الفاحص.' }, { status: 409 })
  }
  if (applicant.inspectorStatus === 'suspended') {
    return NextResponse.json({ error: 'لا يمكن إرسال طلب جديد لهذا الحساب حاليًا.' }, { status: 409 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الاستبيان غير صالحة' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'بيانات الاستبيان غير صالحة' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  const { experienceYears, cities, specialties, qualification, availability, hasEquipment, notes } = input
  if (
    typeof experienceYears !== 'number' || !Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 60 ||
    !Array.isArray(cities) || cities.length < 1 || cities.length > easternProvinceCities.length ||
    !cities.every((city): city is string => typeof city === 'string' && easternProvinceCities.includes(city)) ||
    new Set(cities).size !== cities.length ||
    !Array.isArray(specialties) || specialties.length < 1 || specialties.length > inspectorSpecialties.length ||
    !specialties.every((specialty): specialty is string => typeof specialty === 'string' && inspectorSpecialties.includes(specialty as (typeof inspectorSpecialties)[number])) ||
    new Set(specialties).size !== specialties.length ||
    typeof qualification !== 'string' || qualification.length > 180 ||
    typeof availability !== 'string' || !inspectorAvailabilities.includes(availability as (typeof inspectorAvailabilities)[number]) ||
    typeof hasEquipment !== 'boolean' ||
    typeof notes !== 'string' || notes.length > 1000
  ) {
    return NextResponse.json({ error: 'أكمل الحقول المطلوبة وتحقق من إجاباتك' }, { status: 400 })
  }

  const application: InspectorApplicationInput = {
    experienceYears,
    cities,
    specialties,
    qualification: qualification.trim(),
    availability,
    hasEquipment,
    notes: notes.trim(),
  }
  let user
  try {
    user = await submitInspectorApplication(session.sub, application)
  } catch (error) {
    if (error instanceof SupabaseInspectorApplicationsMigrationRequiredError) {
      return NextResponse.json({
        error: 'يلزم تحديث قاعدة البيانات أولًا بتشغيل supabase/migrations/20260930180200_inspector_applications.sql',
      }, { status: 503 })
    }
    throw error
  }
  if (!user) return NextResponse.json({ error: 'تعذر تقديم الطلب' }, { status: 400 })

  return NextResponse.json({ success: true, inspectorStatus: user.inspectorStatus })
}
