'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  CarFront,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import BrandMark from '@/components/brand-mark'
import { LogoutButton } from '@/components/logout-button'
import { CommandPalette, CommandPaletteTrigger } from '@/components/admin/ui/command-palette'
import { InspectorViewToggle } from '@/components/admin/inspector-view-toggle'

export type AdminNavKey = 'overview' | 'inspections' | 'inspectors' | 'users' | 'audit' | 'security'

const navItems: {
  key: AdminNavKey
  href: string
  label: string
  subtitle: string
  icon: typeof LayoutDashboard
}[] = [
  { key: 'overview', href: '/admin', label: 'نظرة عامة', subtitle: 'الإدارة المحمية', icon: LayoutDashboard },
  { key: 'inspections', href: '/admin/inspections', label: 'طلبات الفحص', subtitle: 'متابعة العمليات', icon: CarFront },
  { key: 'inspectors', href: '/admin/inspectors', label: 'الفاحصون', subtitle: 'إدارة الفريق', icon: ShieldCheck },
  { key: 'users', href: '/admin/users', label: 'المستخدمون', subtitle: 'إدارة الحسابات', icon: UsersRound },
  { key: 'audit', href: '/admin/audit-logs', label: 'سجل التدقيق', subtitle: 'سجل غير قابل للتعديل', icon: ScrollText },
  { key: 'security', href: '/admin/security', label: 'الأمان', subtitle: 'وضع الحماية', icon: Activity },
]

export type ShellQuickStats = {
  users: number
  openInspections: number
  pendingInspectors: number
  flagged: number
}

/**
 * Admin console shell matching the inspector dashboard design language.
 * Uses the same `inspector-*` CSS classes from globals.css — light theme,
 * fixed sidebar, topbar with breadcrumb, bottom mobile nav.
 */
export function AdminShell({
  tier,
  adminName,
  quickStats,
  children,
}: {
  tier: 'admin' | 'super_admin'
  adminName: string
  quickStats: ShellQuickStats
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [lastPathname, setLastPathname] = useState(pathname)

  if (lastPathname !== pathname) {
    setLastPathname(pathname)
  }

  // Longest matching href wins, so `/admin/users/<id>` resolves to `users`
  const current =
    [...navItems]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? navItems[0]

  const stats = [
    { label: 'مستخدم', value: quickStats.users },
    { label: 'طلب مفتوح', value: quickStats.openInspections },
    { label: 'بانتظار الاعتماد', value: quickStats.pendingInspectors },
    { label: 'معلَّم', value: quickStats.flagged },
  ]

  return (
    <main dir="rtl" className="inspector-dashboard">
      <CommandPalette />

      <div className="inspector-dashboard-layout">
        {/* ── Sidebar ── */}
        <aside className="inspector-sidebar" aria-label="التنقل في لوحة الإدارة">
          <Link href="/" className="inspector-logo">
            <BrandMark className="inspector-logo-mark" />
            <span>فاحص<span>.</span><small>لوحة الإدارة</small></span>
          </Link>

          <p className="inspector-nav-caption">مساحة الإدارة</p>
          <nav>
            {navItems.map(({ key, href, label, icon: Icon }) => (
              <Link
                key={key}
                href={href}
                className={current.key === key ? 'is-current' : ''}
              >
                <Icon size={17} />{label}
                {key === 'inspectors' && quickStats.pendingInspectors > 0 && (
                  <span className="inspector-nav-count">{quickStats.pendingInspectors}</span>
                )}
                {key === 'inspections' && quickStats.openInspections > 0 && (
                  <span className="inspector-nav-count">{quickStats.openInspections}</span>
                )}
              </Link>
            ))}
          </nav>

          <div className="inspector-sidebar-help">
            <span><ShieldCheck size={18} /></span>
            <strong>{tier === 'super_admin' ? 'صلاحيات المالك' : 'جلسة إدارية'}</strong>
            <p>تتحكم هذه اللوحة في جميع جوانب المنصة. التغييرات تُسجَّل في سجل التدقيق.</p>
            <a href="/admin/audit-logs">سجل التدقيق <LayoutDashboard size={14} /></a>
          </div>

          <div className="inspector-sidebar-user">
            <span className="inspector-user-avatar">{adminName.slice(0, 1)}</span>
            <span>
              <strong>{adminName}</strong>
              <small>{tier === 'super_admin' ? 'مالك المنصة' : 'مدير'}</small>
            </span>
            <LogoutButton />
          </div>
        </aside>

        {/* ── Workspace ── */}
        <div className="inspector-workspace">
          <header className="inspector-topbar">
            <div>
              <div className="inspector-breadcrumb">
                <span>فاحص</span><span>/</span><strong>{current.label}</strong>
              </div>
              <p className="inspector-topbar-description">{current.subtitle}</p>
            </div>
            <div className="inspector-topbar-actions">
              {tier === 'super_admin' && <InspectorViewToggle />}
              <CommandPaletteTrigger />
              <span className="inspector-status-pill is-online">
                <span />النظام يعمل
              </span>
            </div>
          </header>

          <div className="inspector-content">
            {children}
          </div>

          <nav className="inspector-mobile-nav" aria-label="التنقل السريع">
            {navItems.slice(0, 4).map(({ href, label, icon: Icon }, index) => (
              <Link key={href} href={href} className={index === 0 ? 'is-current' : ''}>
                <Icon size={19} /><span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </main>
  )
}
