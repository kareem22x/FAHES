import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { getCustomerRequests } from '@/lib/customer-data'
import { mayUseCustomerSurface } from '@/lib/surface-access'

/**
 * طلبات العميل — قائمة.
 *
 * ── لماذا هذا المسار موجود ────────────────────────────────────────────────
 *
 * طلبات العميل كانت تُقرأ **في الخادم مباشرةً** عبر `getCustomerRequests` من
 * صفحات `/dashboard/*`، ولم يكن لها مسار API. وواجهة الويب لا تحتاج واحدًا:
 * الصفحة مكوّن خادم يقرأ القاعدة بنفسه.
 *
 * أما تطبيق الجوال فيحتاجها عبر الشبكة، ولا يستطيع قراءتها من Supabase
 * مباشرةً: ترحيل `20261001000010_rls_deny_by_default.sql` يسحب كل صلاحية من
 * `anon` و`authenticated` على `inspections`. فالخادم وحده يقرأ.
 *
 * ── لماذا هو رقيق ─────────────────────────────────────────────────────────
 *
 * لا منطق هنا إطلاقًا: جلسة، ثم نداء الدالة القائمة، ثم إرجاع. أي قاعدة
 * (الملكية، الترتيب، شكل الصفّ) تبقى في `lib/customer-data.ts` وحدها. لو
 * كُتبت هنا لصار عندنا مصدران يتباعدان — وتطبيق يعرض طلبات غير التي يعرضها
 * الموقع.
 *
 * ── GET فقط ───────────────────────────────────────────────────────────────
 *
 * لا `assertSameOrigin` هنا لأن الفحص يتخطّى GET أصلًا (لا يغيّر حالة، فلا
 * معنى لـCSRF). ولذلك لا يُصدَّر POST من هذا الملف: نشر طلب جديد يمرّ عبر
 * `POST /api/inspections` القائم، وهو يملك التحقق والحدود.
 */
export async function GET() {
  const session = await getSession()
  // المسند في `lib/surface-access.ts` لا هنا — لأن **حرس الصفحة** يسأل السؤال
  // نفسه: `requireRoles(['customer'])` يُدخل المالك على الملكية وحدها. وكان
  // هذا السطر يفحص `role !== 'customer'` فيرفض المالك الذي أدخلته الصفحة ⇒
  // لوحة تُرسم ثم يفشل جلبها، وفي تطبيق الجوال شاشة «تعذّر إكمال العملية»
  // كاملة. الحارسان صارا يستدعيان دالة واحدة فلا يتباعدان.
  // `!session` أولًا لا تكرارًا: المسند يقبل `null` ويعيد `false`، لكن
  // TypeScript لا يضيّق النوع عبر دالة تُعيد `boolean` — فبلا هذا الفحص يبقى
  // `session` محتملًا أن يكون `null` عند `session.sub` أدناه.
  if (!session || !mayUseCustomerSurface(session)) {
    return NextResponse.json(
      { error: 'سجّل الدخول كعميل لعرض طلباتك.', reason: 'unauthenticated' },
      { status: 401 },
    )
  }

  try {
    const requests = await getCustomerRequests(session.sub)
    return NextResponse.json({ requests })
  } catch (error) {
    // لا نُسرّب رسالة القاعدة إلى العميل؛ تُسجَّل هنا وتُعرض رسالة عامة.
    console.error('[customer:requests] failed to load requests', {
      customerId: session.sub,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'تعذّر تحميل طلباتك الآن. أعد المحاولة.', reason: 'load_failed' },
      { status: 502 },
    )
  }
}
