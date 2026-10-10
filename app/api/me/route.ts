import { NextRequest, NextResponse } from 'next/server'

import { capabilitiesFor } from '@/lib/app-capabilities'
import { getSession } from '@/lib/auth'
import { isPlatformOwner } from '@/lib/identity-predicates'
import { getUserById } from '@/lib/user-store'

/**
 * «من أنا؟» — نقطة واحدة يعرف منها تطبيق الجوال دوره وواجهته وتبويباته.
 *
 * ── لماذا مسار جديد ───────────────────────────────────────────────────────
 *
 * لم يكن في المنصة مسار يعيد الدور. الويب لا يحتاجه: صفحاته مكوّنات خادم
 * تقرأ الجلسة بنفسها. أما التطبيق فيعرف من Clerk أنه **مسجَّل** فقط، ولا
 * يعرف **من** — والدور ليس claim في رمز Clerk، بل نتيجة قراءة صفّ
 * `user_profiles` (`inspector_status`) وفحص بيئة (`ADMIN_OWNER_*`). أي أنه
 * قرار خادم لا يمكن اشتقاقه في الجهاز.
 *
 * والبديل — أن يجرّب التطبيق نداء كل مسار ويرى أيّها يقبل — أسوأ من كونه
 * قبيحًا: يملأ السجل بأخطاء 401، ويجعل أول شاشة تراها العين خطأ، ويعتمد على
 * أن كل مسار يفشل بالطريقة الصحيحة.
 *
 * ── لماذا `?surface=` ─────────────────────────────────────────────────────
 *
 * المالك يقف في ثلاث واجهات، والويب يختار بواحدة بكوكي موقَّع (`fahes_surface`).
 * و**الكوكي لا يصل هنا**: التطبيق ينادي بـ`Authorization: Bearer`، وClerk
 * يبني الجلسة من الرمز بلا كوكيز — فالمالك في التطبيق يُقرأ دائمًا `admin`
 * ويرى الإدارة أبدًا غيرها.
 *
 * فصار الاختيار وسيط استعلام يُتحقّق منه في الخادم بنفس المسند: ملكية
 * حيّة من `isPlatformOwner`. ولذلك لا يزيد هذا سطح الهجوم: تمرير
 * `?surface=admin` من حساب عميل يُتجاهل تمامًا (مُختبَر في
 * `lib/app-capabilities.test.ts`) — الطلب يُعاد إلى واجهة صاحبه لا إلى ما طلب.
 *
 * ── لماذا `no-store` ──────────────────────────────────────────────────────
 *
 * الرد يحمل الدور، والدور يتغيّر (ترقية فاحص، تجاوز بوابة، تغيير واجهة).
 * وردٌّ مخزَّن مؤقّتًا يعني حسابًا يرى واجهة فقد صلاحيتها — أو أسوأ: لا يرى
 * الواجهة التي اكتسبها. الجلسة قصيرة والمسار رخيص، فلا مكسب من التخزين.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: 'سجّل الدخول أولًا.', reason: 'unauthenticated' },
      { status: 401 },
    )
  }

  const owner = isPlatformOwner({ phone: session.phone, clerkUserId: session.clerkUserId })
  const capabilities = capabilitiesFor({
    role: session.role,
    isPlatformOwner: owner,
    requestedSurface: request.nextUrl.searchParams.get('surface'),
  })

  const user = await getUserById(session.sub)

  return NextResponse.json(
    {
      userId: session.sub,
      role: session.role,
      // الاسم من صفّنا لا من Clerk: هو الاسم الذي تعرضه بقية المنتج، فلا
      // يظهر اسمان مختلفان لنفس الحساب في شاشين.
      displayName: user?.name ?? null,
      phone: session.phone,
      phoneVerified: session.phoneVerified,
      isVerified: session.isVerified,
      inspectorStatus: user?.inspectorStatus ?? 'none',
      inspectorOnline: user?.inspectorProfile?.isOnline ?? false,
      inspectorCities: user?.inspectorProfile?.cities ?? [],
      isPlatformOwner: owner,
      capabilities,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
