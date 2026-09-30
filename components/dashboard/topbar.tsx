'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BellRing, Plus } from 'lucide-react'
import { AccountMenu } from '@/components/account-menu'

const titles: Record<string, { title: string; hint: string }> = {
  '/dashboard': { title: 'نظرة عامة', hint: 'ملخص طلبات الفحص ونشاط حسابك' },
  '/dashboard/requests': { title: 'طلباتي', hint: 'تابع العروض واختر الفاحص المناسب' },
  '/dashboard/reports': { title: 'تقاريري', hint: 'تقارير الفحص المكتملة' },
  '/dashboard/profile': { title: 'ملفي الشخصي', hint: 'بياناتك ورقم التواصل والأمان' },
}

export default function DashboardTopbar() {
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
        <Link href="/requests/new" className="btn btn-primary btn-sm app-topbar-cta"><Plus size={16} /> طلب فحص جديد</Link>
        <Link href="/dashboard/requests" className="app-icon-button" aria-label="تحديثات الطلبات"><BellRing size={17} /></Link>
        <AccountMenu />
      </div>
    </header>
  )
}
