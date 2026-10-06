'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  CarFront,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  Gavel,
  LayoutDashboard,
  LifeBuoy,
  MapPinned,
  Megaphone,
  MoreHorizontal,
  Plus,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Tag,
  TrendingUp,
  TriangleAlert,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import BrandMark from '@/components/brand-mark'
import { LogoutButton } from '@/components/logout-button'
import { CommandPalette, CommandPaletteTrigger } from '@/components/admin/ui/command-palette'
import { SurfaceSwitcher } from '@/components/admin/surface-switcher'
import { NavPending } from '@/components/ui/nav-pending'
import { SURFACE_LABEL, type Surface } from '@/lib/surfaces'

export type AdminNavKey =
  | 'overview'
  | 'analytics'
  | 'inspections'
  | 'inspector-map'
  | 'quality-reviews'
  | 'violations'
  | 'disputes'
  | 'inspector-applications'
  | 'inspectors'
  | 'users'
  | 'showrooms'
  | 'broadcasts'
  | 'reports'
  | 'support'
  | 'audit'
  | 'security'
  | 'pricing'
  | 'settings'

type NavItem = { key: AdminNavKey; href: string; label: string; icon: typeof LayoutDashboard }
type NavGroup = { caption: string; items: NavItem[] }

/**
 * Every page under `app/(admin)/admin/(console)/` appears here exactly once.
 *
 * This is not decoration. Before this list was grouped, the console rendered a
 * flat eight-item nav built by hand, and nine pages that already existed —
 * analytics, broadcasts, disputes, inspector-map, pricing, quality-reviews,
 * reports, showrooms, violations — had **no inbound link anywhere in the
 * codebase**. They were reachable only by typing the URL, so a complete page
 * looked like a missing feature. Grouping by domain is what lets the list grow
 * to the real size of the console without becoming an unreadable wall.
 *
 * Adding a page means adding it here; `navGroups` is the single source of
 * truth for both the sidebar and the phone sheet.
 */
const navGroups: NavGroup[] = [
  {
    caption: 'نظرة عامة',
    items: [
      { key: 'overview', href: '/admin', label: 'النظرة العامة', icon: LayoutDashboard },
      { key: 'analytics', href: '/admin/analytics', label: 'التحليلات', icon: TrendingUp },
    ],
  },
  {
    caption: 'العمليات',
    items: [
      { key: 'inspections', href: '/admin/inspections', label: 'طلبات الفحص', icon: CarFront },
      { key: 'inspector-map', href: '/admin/inspector-map', label: 'خريطة الفاحصين', icon: MapPinned },
      { key: 'quality-reviews', href: '/admin/quality-reviews', label: 'مراجعات الجودة', icon: ClipboardCheck },
      { key: 'violations', href: '/admin/violations', label: 'المخالفات', icon: TriangleAlert },
      { key: 'disputes', href: '/admin/disputes', label: 'النزاعات', icon: Gavel },
    ],
  },
  {
    caption: 'الحسابات',
    items: [
      { key: 'inspector-applications', href: '/admin/inspector-applications', label: 'طلبات التقديم', icon: ClipboardList },
      { key: 'inspectors', href: '/admin/inspectors', label: 'الفاحصون', icon: ShieldCheck },
      { key: 'users', href: '/admin/users', label: 'المستخدمون', icon: UsersRound },
      { key: 'showrooms', href: '/admin/showrooms', label: 'المعارض', icon: Store },
    ],
  },
  {
    caption: 'المحتوى',
    items: [
      { key: 'broadcasts', href: '/admin/broadcasts', label: 'التعميمات', icon: Megaphone },
      { key: 'reports', href: '/admin/reports', label: 'التقارير', icon: FileText },
    ],
  },
  {
    caption: 'النظام',
    items: [
      { key: 'support', href: '/admin/support', label: 'الدعم الفني', icon: LifeBuoy },
      { key: 'audit', href: '/admin/audit-logs', label: 'سجل التدقيق', icon: ScrollText },
      { key: 'security', href: '/admin/security', label: 'الأمان', icon: Activity },
      { key: 'pricing', href: '/admin/pricing', label: 'التسعير', icon: Tag },
      { key: 'settings', href: '/admin/settings', label: 'الإعدادات', icon: Settings },
    ],
  },
]

const navItems = navGroups.flatMap((group) => group.items)

/**
 * What the bottom bar carries on phones. Declared by key rather than taken from
 * `navItems.slice(0, 4)`: the flat order is now grouped, so a positional slice
 * would silently hand the bar «التحليلات» and «خريطة الفاحصين» and drop
 * «المستخدمون». Everything not listed here stays reachable through «المزيد».
 *
 * «طلبات التقديم» earns its place over «الفاحصون» because it is the only entry
 * on this bar that asks for a decision — the rest are read-only views.
 */
const mobileKeys: AdminNavKey[] = ['overview', 'inspector-applications', 'inspections', 'users']

/**
 * Three shortcuts above the nav, mirroring the reference layout's action row.
 *
 * The reference shows *Search / New / Import*. Two of those have no honest
 * equivalent here — this console creates no records, so a "New" that opened an
 * empty form would be a dead end, which is exactly the failure mode the grouped
 * nav above exists to remove. They are mapped onto the closest real
 * destinations instead: composing a broadcast is the console's only create
 * action, and the reports page is where exports live.
 */
const quickActions = [
  { key: 'search', label: 'بحث', icon: Search, href: null },
  { key: 'broadcasts', label: 'تعميم جديد', icon: Plus, href: '/admin/broadcasts' },
  { key: 'reports', label: 'التقارير', icon: Download, href: '/admin/reports' },
] as const

export type ShellQuickStats = {
  users: number
  openInspections: number
  pendingInspectors: number
  flagged: number
}

/**
 * The pending-applications count belongs on «طلبات التقديم», not on
 * «الفاحصون»: that page lists accounts, so a badge there read as "N inspectors"
 * when it actually meant "N people waiting". The count is the same number —
 * `inspector_status = 'pending'` — but the label now matches what it counts.
 */
function badgeFor(key: AdminNavKey, stats: ShellQuickStats): number | null {
  if (key === 'inspector-applications' && stats.pendingInspectors > 0) return stats.pendingInspectors
  if (key === 'inspections' && stats.openInspections > 0) return stats.openInspections
  return null
}

/**
 * Admin console shell.
 *
 * Uses the self-contained `admin-*` design system in `globals.css` — pure white
 * surfaces, `#e2e8f0` hairlines, airy spacing — rather than the `inspector-*`
 * namespace it used to borrow. Those two namespaces exist separately on purpose
 * (`inspector-shell.tsx` renders the inspector panel from the same file), so
 * restyling the inspector classes would have dragged the inspector surface along
 * with a change nobody asked for.
 */
export function AdminShell({
  tier,
  adminName,
  surface = null,
  quickStats,
  children,
}: {
  tier: 'admin' | 'super_admin'
  adminName: string
  /**
   * The surface the owner is standing in, or `null` for the console itself.
   *
   * The console is still rendered while a surface is active whenever the
   * surface *is* an admin route — the support surface is `/admin/support`, so
   * the switcher must show "دعم فني" as current rather than claiming the owner
   * is in the console. Passed down rather than read from the session here
   * because this is a client component and the session is server-side.
   */
  surface?: Surface | null
  quickStats: ShellQuickStats
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [lastPathname, setLastPathname] = useState(pathname)
  const [moreOpen, setMoreOpen] = useState(false)

  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    // The sheet covers the viewport, so leaving it open across a navigation
    // would hide the page the tap just requested.
    if (moreOpen) setMoreOpen(false)
  }

  // Longest matching href wins, so `/admin/users/<id>` resolves to `users`
  const current =
    [...navItems]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? navItems[0]

  const currentGroup = navGroups.find((group) =>
    group.items.some((item) => item.key === current.key),
  )

  return (
    <main dir="rtl" className="admin-root">
      <CommandPalette />

      <div className="admin-layout">
        {/* ── Sidebar ── */}
        <aside className="admin-sidebar" aria-label="التنقل في لوحة الإدارة">
          <Link href="/" className="admin-logo">
            <BrandMark className="admin-logo-mark" />
            <span>
              فاحص<span>.</span>
              <small>لوحة الإدارة</small>
            </span>
          </Link>

          <div className="admin-quick-actions">
            {quickActions.map(({ key, label, icon: Icon, href }) =>
              href === null ? (
                <button
                  key={key}
                  type="button"
                  className="admin-quick-action"
                  onClick={() => window.dispatchEvent(new Event('admin:command-palette'))}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ) : (
                <Link key={key} href={href} className="admin-quick-action">
                  <Icon size={15} />
                  {label}
                </Link>
              ),
            )}
          </div>

          {/* Scrollable: five groups of nav plus the footer card do not fit a
              laptop viewport, and the sidebar is `height: 100vh`, so without
              this the last group and the user block would be unreachable. */}
          <div className="admin-sidebar-scroll">
            {navGroups.map((group) => (
              <div key={group.caption}>
                <p className="admin-nav-section">{group.caption}</p>
                <nav className="admin-nav">
                  {group.items.map(({ key, href, label, icon: Icon }) => {
                    const badge = badgeFor(key, quickStats)
                    return (
                      <Link
                        key={key}
                        href={href}
                        className={current.key === key ? 'is-current' : ''}
                        aria-current={current.key === key ? 'page' : undefined}
                      >
                        <Icon size={16} />
                        {label}
                        <NavPending />
                        {badge !== null && <span className="admin-nav-count">{badge}</span>}
                      </Link>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>

          <div className="admin-sidebar-footer">
            <div className="admin-sidebar-help">
              <span>
                <ShieldCheck size={17} />
              </span>
              <strong>{tier === 'super_admin' ? 'صلاحيات المالك' : 'جلسة إدارية'}</strong>
              <p>تتحكم هذه اللوحة في جميع جوانب المنصة. التغييرات تُسجَّل في سجل التدقيق.</p>
              {/* `Link`, not `<a>`: a bare anchor forces a full document reload, so
                  the console tore down and re-rendered on every visit to the audit
                  log — the exact "route freezing" feel, from the one control in
                  the shell that bypassed client-side routing. */}
              <Link href="/admin/audit-logs">
                سجل التدقيق <ScrollText size={13} />
              </Link>
              {/* «الملف الشخصي» and «الأمان» are deliberately two links. The
                  profile is a screen inside this console; credentials, password
                  and national-ID verification are account-level facts that only
                  `/account` can change. Sending both to `/account` is what made
                  the console's profile menu a dead end — the admin left the
                  console to read their own name. */}
              <Link href="/admin/support/agent-profile">
                ملفي الشخصي <UserRound size={13} />
              </Link>
              <Link href="/account">
                إعدادات الأمان والتحقق <ShieldCheck size={13} />
              </Link>
            </div>

            <div className="admin-sidebar-user">
              <span className="admin-user-avatar">{adminName.slice(0, 1)}</span>
              <span>
                <strong>{adminName}</strong>
                <small>
                  {tier === 'super_admin'
                    ? surface
                      ? `مالك · واجهة ${SURFACE_LABEL[surface]}`
                      : 'مالك المنصة'
                    : 'مدير'}
                </small>
              </span>
              <LogoutButton />
            </div>
          </div>
        </aside>

        {/* ── Workspace ── */}
        <div className="admin-workspace">
          <header className="admin-topbar">
            <div>
              <div className="admin-breadcrumb">
                <span>الإدارة</span>
                <span>/</span>
                {currentGroup && currentGroup.caption !== current.label && (
                  <>
                    <span>{currentGroup.caption}</span>
                    <span>/</span>
                  </>
                )}
                <strong>{current.label}</strong>
              </div>
            </div>
            <div className="admin-topbar-actions">
              {tier === 'super_admin' && <SurfaceSwitcher current={surface} />}
              <CommandPaletteTrigger />
              <span className="admin-status-pill">
                <span />
                النظام يعمل
              </span>
            </div>
          </header>

          <div className="admin-content">{children}</div>

          <nav className="admin-mobile-nav" aria-label="التنقل السريع">
            {mobileKeys.map((key) => {
              const item = navItems.find((candidate) => candidate.key === key)
              if (!item) return null
              const Icon = item.icon
              return (
                <Link
                  key={key}
                  href={item.href}
                  className={current.key === key ? 'is-current' : ''}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <NavPending />
                </Link>
              )
            })}
            <button
              type="button"
              className={moreOpen ? 'is-current' : ''}
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
            >
              <MoreHorizontal size={18} />
              <span>المزيد</span>
            </button>
          </nav>
        </div>
      </div>

      {/* ── Phone sheet: the groups the bottom bar cannot carry ── */}
      {moreOpen && (
        <>
          <div
            className="admin-more-backdrop"
            role="presentation"
            onClick={() => setMoreOpen(false)}
          />
          <div className="admin-more-sheet" role="dialog" aria-modal="true" aria-label="كل الأقسام">
            <div className="admin-more-head">
              <strong>كل الأقسام</strong>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="إغلاق">
                <X size={16} />
              </button>
            </div>
            {navGroups.map((group) => (
              <div key={group.caption}>
                <p className="admin-nav-section">{group.caption}</p>
                <nav className="admin-nav">
                  {group.items.map(({ key, href, label, icon: Icon }) => {
                    const badge = badgeFor(key, quickStats)
                    return (
                      <Link
                        key={key}
                        href={href}
                        className={current.key === key ? 'is-current' : ''}
                        onClick={() => setMoreOpen(false)}
                      >
                        <Icon size={16} />
                        {label}
                        {badge !== null && <span className="admin-nav-count">{badge}</span>}
                      </Link>
                    )
                  })}
                </nav>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
