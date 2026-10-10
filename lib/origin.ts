import { NextRequest, NextResponse } from 'next/server'

/**
 * فحص أصل الطلب — حماية من CSRF على المسارات التي تُغيّر حالة.
 *
 * ── ما الذي يحميه فعلًا ───────────────────────────────────────────────────
 *
 * CSRF مشكلة **كوكيز**: المتصفح يرفق كوكي الجلسة تلقائيًّا بأي طلب يخرج من
 * الصفحة، حتى لو أطلقه موقع آخر. فالموقع الخبيث يستعير جلسة الضحية بلا أن
 * يقرأها. الفحص هنا يسأل: «هل أتى الطلب من أصلنا؟» — وإن لم يأتِ، فالكوكي
 * المرفق لا يجوز الاعتماد عليه.
 *
 * ── استثناء الترويسة (مضاف 2026-10-08) ────────────────────────────────────
 *
 * `Authorization: Bearer …` **لا يُرفق تلقائيًّا أبدًا**. لا يستطيع موقع
 * خارجي أن يجعل متصفح الضحية يرسل ترويسة يختارها، ولا أن يعرف الرمز ليرسله
 * بنفسه. أي أن طلبًا يحمل رمز Bearer **لا يمكن أن يكون هجوم CSRF**، لأن
 * الرمز لا يصل إليه المهاجم أصلًا: من يرسله يرسل اعتماده هو.
 *
 * ⚠️ (2026-10-09) هذا الاستدلال **لا يعتمد على CORS**. كان يستند جزئيًّا إلى
 * «لا نُجيب أي طلب تمهيدي بترويسات CORS» — وقد صار `/api/*` **يُجيب**
 * التمهيدي، لأن تطبيق الجوال (معاينة الويب) يقرأ من أصل آخر. الحارس الباقي
 * هو **غياب `Access-Control-Allow-Credentials`** في `proxy.ts`: بلا هذا
 * الحقل لا يُرفق المتصفح كوكي الضحية ولا يكشف جسم الرد لصفحة أخرى ⇒ CSRF
 * يبقى مستحيلًا. من يُرخّي هذا الحقل يومًا يُبطل الاستثناء كله.
 *
 * ⇒ الرمز المُرسَل في ترويسة صريحة يخرج عن نطاق هذا الفحص بمبدأ صحيح، لا
 * بثغرة. وبدون هذا الاستثناء تفشل **كل** مسارات POST من تطبيق الجوال:
 * React Native لا يرسل `Origin` ولا `Sec-Fetch-Site`، فيُرفض الطلب 403 قبل
 * أن يصل إلى منطق المسار. (٣١ مسارًا يستدعي هذا الفحص.)
 *
 * ولم يضعف الويب بذلك: طلبات الويب من نفس الأصل تمرّ أصلًا، وطلباته لا تحمل
 * Bearer في الغالب — وإن حملته فهي من أصلنا كذلك.
 */
export function assertSameOrigin(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null
  }

  // Bearer صريح ⇒ خارج نطاق CSRF (الشرح أعلاه). النمط يرفض ترويسة فارغة أو
  // بلا قيمة، حتى لا يفتح تمرير `Authorization: Bearer` بلا رمز بابًا.
  const authorization = request.headers.get('authorization')
  if (authorization && /^Bearer\s+\S+/i.test(authorization)) {
    return null
  }

  const host = request.headers.get('host')
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  const allowed = (value: string | null) => {
    if (!value || !host) return false
    try {
      return new URL(value).host === host
    } catch {
      return false
    }
  }

  if (origin) {
    if (!allowed(origin)) {
      return NextResponse.json({ error: 'طلب غير مصرح' }, { status: 403 })
    }
    return null
  }

  const site = request.headers.get('sec-fetch-site')
  if (site === 'same-origin') return null

  if (referer && allowed(referer)) return null

  return NextResponse.json({ error: 'طلب غير مصرح' }, { status: 403 })
}
