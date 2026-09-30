import Link from 'next/link'
import { BadgeCheck, LayoutDashboard } from 'lucide-react'
import AccountProfile from '@/components/account-profile'
import SiteHeader from '@/components/site-header'

export const metadata = { title: 'حسابي' }

export default function AccountPage() {
  return (
    <main className="account-shell" dir="rtl">
      <SiteHeader navigation={[]} compact ctaLabel="اطلب فحصًا" />
      <div className="account-container">
        <section className="account-hero">
          <div>
            <span className="account-hero-badge"><BadgeCheck size={15} /> تم تسجيل الدخول بنجاح</span>
            <h1>حسابك في فاحص</h1>
            <p>راجع بياناتك، وثّق رقم جوالك، وانتقل إلى مساحة العمل المناسبة لحسابك.</p>
          </div>
          <Link href="/dashboard" className="btn btn-ghost">
            <LayoutDashboard size={17} /> مساحة العمل
          </Link>
        </section>

        <AccountProfile />

        <footer className="account-footer">
          <Link href="/">فاحص<span>.</span></Link>
          <span>© 2026 فاحص. جميع الحقوق محفوظة.</span>
        </footer>
      </div>
    </main>
  )
}
