import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import DashboardNav from '@/components/modules/customer/dashboard/nav'
import DashboardTopbar from '@/components/modules/customer/dashboard/topbar'
import { requirePhoneVerified, requireRoles } from '@/lib/auth'
import { getCustomerRequests, summarizeRequests } from '@/lib/customer-data'
import { maskPhone } from '@/lib/phone'
import { getUserById } from '@/lib/user-store'
import { initialsOf } from '@/lib/utils'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRoles(['customer'])
  await requirePhoneVerified(session)
  const [user, requests] = await Promise.all([
    getUserById(session.sub),
    getCustomerRequests(session.sub),
  ])
  const summary = summarizeRequests(requests)
  const name = user?.name?.trim() || 'حساب عميل'

  return (
    <div className="app-shell" dir="rtl">
      <aside className="app-sidebar">
        <Link href="/" className="app-logo" aria-label="فاحص — الصفحة الرئيسية">
          <BrandMark className="app-logo-mark" />
          <span className="app-logo-text">
            <b>فاحص<span>.</span></b>
            <small>مساحة العميل</small>
          </span>
        </Link>

        <DashboardNav counts={{ requests: summary.active, reports: summary.completed }} />

        <div className="app-sidebar-foot">
          <div className="app-side-help">
            <strong>تحتاج مساعدة؟</strong>
            <p>فريق فاحص يتابع طلبك من النشر حتى استلام التقرير.</p>
            <Link href="/help">مركز المساعدة</Link>
          </div>
          <div className="app-side-user">
            <span className="app-side-avatar" aria-hidden="true">{initialsOf(name)}</span>
            <span className="app-side-user-text">
              <strong>{name}</strong>
              <small>{session.phone ? maskPhone(session.phone) : 'رقم غير مضاف'}</small>
            </span>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <DashboardTopbar />
        <nav className="app-mobile-nav" aria-label="تنقل لوحة العميل للجوال">
          <DashboardNav counts={{ requests: summary.active, reports: summary.completed }} />
        </nav>
        <div className="app-content">{children}</div>
      </div>
    </div>
  )
}
