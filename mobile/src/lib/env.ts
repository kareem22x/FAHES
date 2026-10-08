/**
 * إعدادات البيئة — تُقرأ مرّة واحدة وتُتحقَّق عند الإقلاع.
 *
 * ── لماذا `EXPO_PUBLIC_` ──────────────────────────────────────────────────
 *
 * Expo يضمّن في الحزمة **فقط** المتغيّرات المسبوقة بـ`EXPO_PUBLIC_`، وهذا
 * الحجب مقصود: أي متغيّر آخر يبقى على جهاز البناء. لذلك لا يمكن إعادة استخدام
 * `NEXT_PUBLIC_*` من تطبيق الويب مباشرةً — الأسماء مختلفة عن قصد، لأن
 * البادئة هي التي تقرّر ما يُشحن إلى الجهاز.
 *
 * ⚠️ **لا تضع سرًّا هنا.** كل ما في هذا الملف يُقرأ من ملف APK/IPA المفكوك.
 * مفتاح Clerk المنشور (`pk_`) ومفتاح Supabase العام مصمَّمان للعرض؛ أما
 * `CLERK_SECRET_KEY` و`SUPABASE_SECRET_KEY` و`MOYASAR_SECRET_KEY` فلا تصل
 * إلى هذا الملف أبدًا — تبقى في الخادم، والتطبيق يمرّ عبر `/api/*`.
 *
 * ── لماذا `API_URL` لا عميل Supabase مباشر ────────────────────────────────
 *
 * ترحيل `20261001000010_rls_deny_by_default.sql` يفعل
 * `revoke all on … from public, anon, authenticated` على `inspections`
 * و`inspection_offers` وغيرها. أي أن **قراءة Supabase من الجهاز مرفوضة
 * بالتصميم** — لا لأن المفتاح ناقص، بل لأن القاعدة لا تمنح أي دور عميل
 * صلاحية. الخادم وحده يقرأ بمفتاح الخدمة.
 *
 * ⇒ فالتطبيق يتكلّم مع مسارات `/api/*` الحالية، وهي تعيد استخدام كل منطق
 * الخادم القائم: فحص الملكية، التحقق من المدخلات، تسوية الدفع، قبول العروض.
 * ووسيط Clerk (`proxy.ts`) يقرأ ترويسة `Authorization: Bearer` لأن
 * `clerkMiddleware` يضبط `acceptsToken: 'any'`، فيعمل `getSession()` كما هو
 * بلا سطر واحد يتغيّر في الويب.
 */

/**
 * العنوان الافتراضي للخادم.
 *
 * النشر الحالي على Vercel. يُتجاوَز بـ`EXPO_PUBLIC_API_URL` للتطوير المحلي
 * (`http://192.168.x.x:4001` — عنوان LAN لا `localhost`، لأن الجهاز/المحاكي
 * لا يرى `localhost` الخاص بحاسوبك).
 */
const DEFAULT_API_URL = 'https://fahes-gray.vercel.app'

/**
 * مفتاح Clerk المنشور — احتياطيّ.
 *
 * مكتوب هنا لأن التطبيق يجب أن يُقلع بلا ملف `.env` في أول تشغيل (مستودع
 * جديد، جهاز زميل). وهو **عام بطبيعته**: يظهر في كل صفحة من الويب أصلًا.
 */
const DEFAULT_CLERK_PUBLISHABLE_KEY = 'pk_test_cmVsaWV2ZWQtZXdlLTkxNy5jbGVyay5hY2NvdW50cy5kZXYk'

/**
 * 🔴 **القراءة يجب أن تكون حرفية: `process.env.EXPO_PUBLIC_X` لا `process.env[x]`.**
 *
 * إضافة Babel في Expo تستبدل **النصّ الحرفي** `process.env.EXPO_PUBLIC_*` بقيمة
 * نصّية وقت البناء. الوصول الديناميكي (`process.env[name]`) **لا يُستبدَل**،
 * فيبقى `process.env` كائنًا فارغًا في الحزمة ⇒ `undefined` على الجهاز **مع أن
 * المتغيّر مضبوط في `.env`**. وهي علّة تُظهر نفسها في الإصدار المبنيّ فقط، لا
 * في `expo start` — أي أسوأ نوع من الأخطاء. ولهذا يمنعها
 * `expo/no-dynamic-env-var` في ESLint.
 */
function literal(raw: string | undefined, fallback: string): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value || fallback
}

export const env = {
  /** جذر الـAPI — بلا شرطة أخيرة، حتى لا تتضاعف في التركيب. */
  apiUrl: literal(process.env.EXPO_PUBLIC_API_URL, DEFAULT_API_URL).replace(/\/+$/, ''),
  clerkPublishableKey: literal(
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    DEFAULT_CLERK_PUBLISHABLE_KEY,
  ),
} as const

/**
 * تحقّق عند الإقلاع من أن مفتاح Clerk بالشكل الصحيح.
 *
 * `@clerk/clerk-expo` يرفض مفتاحًا لا يبدأ بـ`pk_` برسالة غامضة داخل شجرة
 * المكوّنات. الفحص هنا يحوّل ذلك إلى سبب واضح في السجل — وهو فرق كبير حين
 * يكون الخطأ في ملف `.env` لا في الكود.
 */
export function assertEnv(): void {
  const key = env.clerkPublishableKey
  if (!key.startsWith('pk_')) {
    console.error(
      '[env] EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY لا يبدأ بـ`pk_` — تسجيل الدخول سيفشل.',
      `القيمة الحالية تبدأ بـ«${key.slice(0, 8)}».`,
    )
  }
}
