import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SignIn } from '@clerk/nextjs'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { ShieldCheck } from 'lucide-react'
import BrandMark from '@/components/brand-mark'
import { clerkAppearance } from '@/lib/clerk-appearance'
import { safeReturnPath } from '@/lib/safe-return-path'

export const metadata = { title: 'تسجيل الدخول' }

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'sign-in'?: string[] }>
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const [{ 'sign-in': segments }, { redirect_url }] = await Promise.all([params, searchParams])

  // A visitor who already has a session must never sit on this page: Clerk would
  // bounce them to the fallback redirect and the site header links back here,
  // producing an unbreakable loop. Only the bare entry point is guarded — Clerk
  // serves its own sub-steps (`/sign-in/factor-one`, …) and those must render
  // untouched.
  if (!segments?.length) {
    const { userId } = await clerkAuth()
    if (userId) redirect(safeReturnPath(redirect_url))
  }

  return (
    <main dir="rtl" className="auth-shell">
      <aside className="auth-aside">
        <Link href="/" className="auth-brand" aria-label="فاحص — الصفحة الرئيسية">
          <BrandMark className="auth-brand-mark" />
          <span>فاحص<span>.</span></span>
        </Link>
        <div className="auth-aside-copy">
          <span className="auth-eyebrow"><ShieldCheck size={15} /> مساحة العمل الآمنة</span>
          <h1>سجّل دخولك وتابع فحص سيارتك</h1>
          <p>من حسابك ترى عروض الفاحصين، تختار الأنسب، وتستلم تقرير الفحص بالصور والملاحظات — وأنت في أي مدينة.</p>
        </div>
        <ul className="auth-points">
          <li>عروض الفاحصين القريبين من موقع السيارة</li>
          <li>متابعة حالة الفحص خطوة بخطوة</li>
          <li>تقارير وصور محفوظة في حسابك</li>
        </ul>
      </aside>

      <section className="auth-panel">
        <div className="auth-card">
          <SignIn
            forceRedirectUrl="/auth/complete"
            fallbackRedirectUrl="/auth/complete"
            appearance={clerkAppearance}
          />
        </div>
        <p className="auth-foot">بالمتابعة أنت توافق على <Link href="/terms">الشروط والأحكام</Link> و<Link href="/privacy">سياسة الخصوصية</Link>.</p>
      </section>
    </main>
  )
}
