import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { getSession, postAuthPath, type AppSession } from '@/lib/auth'
import { SupabaseConfigurationError, SupabaseMigrationRequiredError } from '@/lib/supabase/server'

export default async function AuthCompletePage() {
  let session: AppSession | null = null
  let setupRequired = false
  let phoneMigrationRequired = false

  try {
    const clerkSession = await clerkAuth()
    if (!clerkSession.userId || !clerkSession.sessionId) redirect('/sign-in')

    session = await getSession()
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) setupRequired = true
    else if (error instanceof SupabaseMigrationRequiredError) phoneMigrationRequired = true
    else throw error
  }

  if (phoneMigrationRequired) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5 py-10 text-[#0b1f46]">
        <section className="w-full max-w-xl rounded-3xl border border-[#0b1f46]/10 bg-white p-7 shadow-sm sm:p-10">
          <span className="inline-flex rounded-full bg-[#eaf4ff] px-3 py-1 text-xs font-bold text-[#075cae]">يلزم تحديث قاعدة البيانات</span>
          <h1 className="mt-5 text-2xl font-black sm:text-3xl">تسجيل الدخول برقم جوال اختياري يحتاج ترحيلًا جديدًا</h1>
          <p className="mt-4 text-sm leading-7 text-[#607087]">
            افتح Supabase ثم SQL Editor، وشغّل مرة واحدة ملف
            {' '}<code dir="ltr" className="rounded bg-[#f3f4f1] px-1.5 py-0.5">supabase/migrations/20260930175500_optional_clerk_phone.sql</code>.
            بعد نجاحه أعد تشغيل الموقع ثم حاول تسجيل الدخول مجددًا. لا تعِد تشغيل الملف إذا نُفّذ بنجاح.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#607087]">
            هذا التحديث يسمح للعملاء بالتسجيل دون رقم جوال، مع إبقاء رقم الفاحص مطلوبًا عند طلب الانضمام.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <SignOutButton redirectUrl="/sign-in">
              <button type="button" className="rounded-full bg-[#0b1f46] px-5 py-3 text-sm font-bold text-white">تسجيل الخروج</button>
            </SignOutButton>
            <Link href="/" className="rounded-full border border-[#0b1f46]/10 px-5 py-3 text-sm font-bold text-[#607087]">العودة للرئيسية</Link>
          </div>
        </section>
      </main>
    )
  }

  if (setupRequired) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5 py-10 text-[#0b1f46]">
        <section className="w-full max-w-xl rounded-3xl border border-[#0b1f46]/10 bg-white p-7 shadow-sm sm:p-10">
          <span className="inline-flex rounded-full bg-[#fff1e8] px-3 py-1 text-xs font-bold text-[#98512e]">خطوة إعداد مطلوبة</span>
          <h1 className="mt-5 text-2xl font-black sm:text-3xl">تم تسجيل الدخول، لكن قاعدة البيانات غير مكتملة الإعداد</h1>
          <p className="mt-4 text-sm leading-7 text-[#607087]">
            أضف مفتاح خادم Supabase إلى <code dir="ltr" className="rounded bg-[#f3f4f1] px-1.5 py-0.5">.env.local</code> باسم
            {' '}<code dir="ltr" className="rounded bg-[#f3f4f1] px-1.5 py-0.5">SUPABASE_SECRET_KEY</code>
            {' '}أو <code dir="ltr" className="rounded bg-[#f3f4f1] px-1.5 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code>،
            ثم نفّذ ملفات الترحيل الموجودة في <code dir="ltr" className="rounded bg-[#f3f4f1] px-1.5 py-0.5">supabase/migrations/</code>
            {' '}بالترتيب وأعد تشغيل الموقع.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#607087]">
            المفتاح السري يتجاوز حماية قاعدة البيانات؛ لا تضعه في المتصفح أو ترسله في المحادثة. بعد الإعداد سجّل الخروج ثم ادخل مجددًا.
          </p>
        </section>
      </main>
    )
  }

  if (!session) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5 py-10 text-[#0b1f46]">
        <section className="w-full max-w-xl rounded-3xl border border-[#0b1f46]/10 bg-white p-7 shadow-sm sm:p-10">
          <span className="inline-flex rounded-full bg-[#eaf4ff] px-3 py-1 text-xs font-bold text-[#075cae]">تعذر تحميل الحساب</span>
          <h1 className="mt-5 text-2xl font-black sm:text-3xl">تم تسجيل الدخول، لكن لم نتمكن من تحميل ملفك</h1>
          <p className="mt-4 text-sm leading-7 text-[#607087]">
            رقم الجوال اختياري لحساب العميل. تحقق من إعداد قاعدة البيانات وترحيل ربط Clerk، ثم سجّل الخروج وأعد المحاولة.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <SignOutButton redirectUrl="/sign-in">
              <button type="button" className="rounded-full bg-[#0b1f46] px-5 py-3 text-sm font-bold text-white">تسجيل الخروج والمحاولة مجددًا</button>
            </SignOutButton>
            <Link href="/" className="rounded-full border border-[#0b1f46]/10 px-5 py-3 text-sm font-bold text-[#607087]">العودة للرئيسية</Link>
          </div>
        </section>
      </main>
    )
  }

  // Role-aware landing.
  //
  // `getSession()` has already resolved the role from the stored profile — an
  // approved inspector application is what turns a customer into an inspector —
  // so this page only has to honour that decision. Sign-in and sign-up both
  // funnel here via `forceRedirectUrl`, which makes this the single place a
  // post-authentication destination is decided for a normal sign-in.
  //
  // (Someone who was bounced off a protected page keeps their original target:
  // `proxy.ts` stores it as `redirect_url` and `/sign-in` restores it through
  // `safeReturnPath`, so that path never reaches this branching.)
  redirect(postAuthPath(session))
}
