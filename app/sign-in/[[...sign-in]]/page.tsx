import Link from 'next/link'
import { SignIn } from '@clerk/nextjs'
import { ShieldCheck } from 'lucide-react'
import BrandMark from '@/components/brand-mark'
import { clerkAppearance } from '@/lib/clerk-appearance'

export const metadata = { title: 'تسجيل الدخول' }

export default function SignInPage() {
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
