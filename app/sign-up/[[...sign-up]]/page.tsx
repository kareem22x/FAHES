import Link from 'next/link'
import { SignUp } from '@clerk/nextjs'
import { BadgeCheck, CarFront, FileText } from 'lucide-react'
import BrandMark from '@/components/brand-mark'
import { clerkAppearance } from '@/lib/clerk-appearance'

export const metadata = { title: 'إنشاء حساب' }

const steps = [
  { icon: CarFront, title: 'أنشئ حسابك', text: 'بالبريد الإلكتروني أو Google — رقم الجوال اختياري.' },
  { icon: BadgeCheck, title: 'انشر طلب فحص', text: 'حدد موقع السيارة ونوع الفحص والموعد.' },
  { icon: FileText, title: 'استلم التقرير', text: 'قارن العروض وتابع الفحص حتى التقرير النهائي.' },
]

export default function SignUpPage() {
  return (
    <main dir="rtl" className="auth-shell">
      <aside className="auth-aside">
        <Link href="/" className="auth-brand" aria-label="فاحص — الصفحة الرئيسية">
          <BrandMark className="auth-brand-mark" />
          <span>فاحص<span>.</span></span>
        </Link>
        <div className="auth-aside-copy">
          <span className="auth-eyebrow"><BadgeCheck size={15} /> حساب مجاني</span>
          <h1>أنشئ حسابك وابدأ طلب فحص</h1>
          <p>حساب واحد يكفي لمتابعة كل سياراتك وتقاريرها في المنطقة الشرقية.</p>
        </div>
        <ol className="auth-steps">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <li key={title}>
              <span className="auth-step-index">{index + 1}</span>
              <span className="auth-step-icon"><Icon size={17} /></span>
              <span><strong>{title}</strong><small>{text}</small></span>
            </li>
          ))}
        </ol>
      </aside>

      <section className="auth-panel">
        <div className="auth-card">
          <SignUp
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
