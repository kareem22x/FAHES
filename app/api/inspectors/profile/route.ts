import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { assertSameOrigin } from '@/lib/origin'
import { SUPPORTED_CITIES, isOperationalCity } from '@/lib/locations/saudi-cities'
import { updateInspectorProfile } from '@/lib/user-store'

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await resolveInspectorSession()
  if (!session) {
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

  /**
   * ⚠️ التحقّق على **`SUPPORTED_CITIES`** لا على `easternProvinceCities`.
   *
   * كان يتحقّق على القائمة الكاملة (19 مدينة: 5 مدعومة + 14 «قريبًا»)، وهذا
   * الثغرة التي أنتجت «الطلب خارج مدن عملك»:
   *
   *   1. الفاحص يختار «الظهران» (قريبًا) من الواجهة ⇒ القائمة تمرّ.
   *   2. تُحفظ في `inspector_cities` في القاعدة.
   *   3. لكن الطلبات لا تُنشأ إلا في المدن الخمس المدعومة —
   *      `/api/inspections` يرفض غيرها بـ`isOperationalCity`.
   *   4. فيصبح الفاحص «متاحًا» بمدن لا يصله منها طلب أبدًا، وأي طلب يحاول
   *      العرض عليه يُرفض لأنه خارج مدنه.
   *
   * القاعدة مكتوبة في ترويسة `saudi-cities.ts`: القائمة الكاملة للعرض فقط،
   * **ولا تُستخدم للتخويل**. هذا الملف كان يخالفها.
   */
  if (
    typeof isOnline !== 'boolean' ||
    !Array.isArray(cities) ||
    cities.length > SUPPORTED_CITIES.length ||
    !cities.every((city): city is string => typeof city === 'string' && isOperationalCity(city)) ||
    new Set(cities).size !== cities.length
  ) {
    return NextResponse.json(
      { error: 'تحقق من حالة التوفر والمدن المختارة. المدن المتاحة للعمل الآن: ' + SUPPORTED_CITIES.join('، ') },
      { status: 400 },
    )
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
