'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, LifeBuoy, Ticket } from 'lucide-react'

/**
 * Sidebar navigation for the support area.
 *
 * Rendered twice — once in the sidebar and once in `.app-mobile-nav` — exactly
 * as `DashboardNav` is, so the desktop and phone navigation can never list
 * different destinations.
 *
 * `consoleHref`/`consoleLabel` are resolved on the server by the layout from
 * `dashboardPath()`. They are props rather than computed here because the answer
 * depends on the role *and* on the surface an operator is standing in, and this
 * component has no session.
 */
export default function SupportNav({
  openCount,
  consoleHref,
  consoleLabel,
}: {
  openCount: number
  consoleHref: string
  consoleLabel: string
}) {
  const pathname = usePathname()

  const items = [
    { href: '/support/tickets', label: 'تذاكر الدعم', icon: Ticket, count: openCount },
    { href: '/help', label: 'مركز المساعدة', icon: LifeBuoy, count: 0 },
    { href: consoleHref, label: consoleLabel, icon: LayoutDashboard, count: 0 },
  ]

  return (
    <nav className="app-nav" aria-label="تنقل مركز الدعم">
      <span className="app-nav-caption">مركز الدعم</span>
      {items.map(({ href, label, icon: Icon, count }) => {
        const isCurrent = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            className={isCurrent ? 'is-current' : undefined}
            aria-current={isCurrent ? 'page' : undefined}
          >
            <Icon size={17} />
            <span>{label}</span>
            {count > 0 && <span className="app-nav-count">{count}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
