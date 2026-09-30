import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { easternProvinceCities } from '@/lib/eastern-province'
import { updateInspectorProfile } from '@/lib/user-store'

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'inspector') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }

  const { isOnline, cities } = body as { isOnline?: unknown; cities?: unknown }
  if (
    typeof isOnline !== 'boolean' ||
    !Array.isArray(cities) ||
    cities.length > easternProvinceCities.length ||
    !cities.every((city): city is string => typeof city === 'string' && easternProvinceCities.includes(city)) ||
    new Set(cities).size !== cities.length
  ) {
    return NextResponse.json({ error: 'تحقق من حالة التوفر والمدن المختارة' }, { status: 400 })
  }

  if (isOnline && cities.length === 0) {
    return NextResponse.json({ error: 'اختر مدينة واحدة على الأقل قبل تفعيل حالة التوفر' }, { status: 400 })
  }

  const user = await updateInspectorProfile(session.sub, { isOnline, cities })
  if (!user) {
    return NextResponse.json({ error: 'تعذر تحديث ملف الفاحص المعتمد' }, { status: 403 })
  }

  return NextResponse.json({ success: true, profile: user.inspectorProfile })
}
