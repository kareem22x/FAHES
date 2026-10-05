'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BellRing, Plus } from 'lucide-react'
import { AccountMenu } from '@/components/modules/account/account-menu'
import { SurfaceExit } from '@/components/admin/surface-exit'

const titles: Record<string, { title: string; hint: string }> = {
  '/dashboard': { title: 'نظرة عامة', hint: 'ملخص طلبات الفحص ونشاط حسابك' },
  '/dashboard/requests': { title: 'طلباتي', hint: 'تابع العروض واختر الفاحص المناسب' },
  '/dashboard/reports': { title: 'تقاريري', hint: 'تقارير الفحص المكتملة' },
  '/dashboard/profile': { title: 'ملفي الشخصي', hint: 'بياناتك ورقم التواصل والأمان' },
}

/**
 * `ownerSurface` is true only when a platform owner is standing in the client
 * surface — i.e. the account is an admin wearing the customer's view. A real
 * customer never sees the return control, because for them there is nothing to
 * return to: `requireRoles(['customer'])` admits owners by design, so the
 * surface flag is the only thing that distinguishes the two cases here.
 */
export default function DashboardTopbar({ ownerSurface = false }: { ownerSurface?: boolean }) {
  const pathname = usePathname()
  const meta = titles[pathname] ?? (pathname.startsWith('/dashboard/inspections')
    ? { title: 'تقرير الفحص', hint: 'تفاصيل الفحص والملاحظات' }
    : { title: 'لوحة العميل', hint: 'إدارة طلبات الفحص' })

  return (
    <header className="app-topbar">
      <div className="app-topbar-title">
        <p>{meta.hint}</p>
        <h1>{meta.title}</h1>
      </div>
      <div className="app-topbar-actions">
        {ownerSurface && <SurfaceExit />}
        <Link href="/requests/new" className="btn btn-primary btn-sm app-topbar-cta"><Plus size={16} /> طلب فحص جديد</Link>
        <Link href="/dashboard/requests" className="app-icon-button" aria-label="تحديثات الطلبات"><BellRing size={17} /></Link>
        <AccountMenu />
      </div>
    </header>
  )
}
