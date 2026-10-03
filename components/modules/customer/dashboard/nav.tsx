'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CarFront, FileText, LayoutDashboard, LifeBuoy, UserRound } from 'lucide-react'

const items = [
  { href: '/dashboard', label: 'نظرة عامة', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/requests', label: 'طلباتي', icon: CarFront, badge: 'requests' as const },
  { href: '/dashboard/reports', label: 'تقاريري', icon: FileText, badge: 'reports' as const },
  { href: '/dashboard/profile', label: 'ملفي الشخصي', icon: UserRound },
  { href: '/help', label: 'مركز المساعدة', icon: LifeBuoy },
]

export default function DashboardNav({ counts }: { counts: { requests: number; reports: number } }) {
  const pathname = usePathname()

  return (
    <nav className="app-nav" aria-label="تنقل لوحة العميل">
      <span className="app-nav-caption">لوحة العميل</span>
      {items.map(({ href, label, icon: Icon, exact, badge }) => {
        const isCurrent = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
        const count = badge === 'requests' ? counts.requests : badge === 'reports' ? counts.reports : 0
        return (
          <Link key={href} href={href} className={isCurrent ? 'is-current' : undefined} aria-current={isCurrent ? 'page' : undefined}>
            <Icon size={17} />
            <span>{label}</span>
            {count > 0 && <span className="app-nav-count">{count}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
