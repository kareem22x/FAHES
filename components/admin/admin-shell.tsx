'use client'

import { useSyncExternalStore, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import {
  Activity,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Crown,
  LayoutDashboard,
  ScrollText,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import BrandMark from '@/components/brand-mark'
import { LogoutButton } from '@/components/logout-button'
import { GlassBadge, StatusDot } from '@/components/admin/ui/glass'
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

const STORAGE_KEY = 'fahes.admin.sidebar.collapsed'

/**
 * The sidebar preference lives in `localStorage`, which is an external store —
 * so it is read through `useSyncExternalStore` rather than mirrored into React
 * state by an effect. That keeps SSR honest (server snapshot is always
 * "expanded") without a hydration mismatch, and picks up changes made in other
 * tabs via the `storage` event.
 */
const sidebarPreference = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    sidebarPreference.listeners.add(listener)
    window.addEventListener('storage', listener)
    return () => {
      sidebarPreference.listeners.delete(listener)
      window.removeEventListener('storage', listener)
    }
  },
  getSnapshot() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      // Storage can be blocked; expanded is the safe default.
      return false
    }
  },
  set(next: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Ignore — the in-memory listeners still update the current tab.
    }
    for (const listener of sidebarPreference.listeners) listener()
  },
}

/**
 * Dark console chrome: collapsible sidebar, quick-stat header, system status
 * badges and the Ctrl+K palette.
 *
 * The active section is derived from the pathname rather than passed in, which
 * lets the layout render the shell exactly once instead of every page having to
 * repeat it.
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
  const collapsed = useSyncExternalStore(
    sidebarPreference.subscribe,
    sidebarPreference.getSnapshot,
    () => false,
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [lastPathname, setLastPathname] = useState(pathname)

  // Close the mobile drawer on navigation. Adjusting state during render (rather
  // than in an effect) is the documented React pattern for "reset state when an
  // input changes" and avoids a second render pass with a stale drawer.
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setMobileOpen(false)
  }

  // Longest matching href wins, so `/admin/users/<id>` resolves to `users`
  // instead of falling back to the `/admin` prefix.
  const current =
    [...navItems]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? navItems[0]

  function toggleCollapsed() {
    sidebarPreference.set(!collapsed)
  }

  const stats = [
    { label: 'مستخدم', value: quickStats.users, tone: 'neutral' as const },
    {
      label: 'طلب مفتوح',
      value: quickStats.openInspections,
      tone: quickStats.openInspections > 0 ? ('warn' as const) : ('neutral' as const),
    },
    {
      label: 'بانتظار الاعتماد',
      value: quickStats.pendingInspectors,
      tone: quickStats.pendingInspectors > 0 ? ('warn' as const) : ('neutral' as const),
    },
    {
      label: 'معلَّم',
      value: quickStats.flagged,
      tone: quickStats.flagged > 0 ? ('bad' as const) : ('neutral' as const),
    },
  ]

  const nav = (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={current.key === key ? 'page' : undefined}
          title={collapsed ? label : undefined}
          className={cn(
            // min-h-[44px] is the iOS/Android touch-target floor; on the
            // collapsed rail the icon is centred inside the same 44px box.
            'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-xs transition-colors',
            collapsed && 'justify-center px-0',
            current.key === key
              ? 'bg-white/10 font-medium text-white'
              : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100',
          )}
        >
          <Icon className={cn('size-4 shrink-0', current.key === key ? 'text-sky-400' : 'text-neutral-500')} />
          {!collapsed && <span className="truncate">{label}</span>}
        </Link>
      ))}
    </nav>
  )

  return (
    <div dir="rtl" className="min-h-screen bg-neutral-950 text-neutral-200">
      <CommandPalette />

      <div className="mx-auto flex max-w-[1600px]">
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 flex-col border-l border-white/10 bg-neutral-950/80 p-3 backdrop-blur-2xl transition-[width] duration-200 lg:flex',
            collapsed ? 'w-[68px]' : 'w-60',
          )}
        >
          <div className={cn('flex items-center gap-2.5 px-1 py-2', collapsed && 'justify-center')}>
            <BrandMark className="size-8 shrink-0 object-contain" />
            {!collapsed && (
              <span className="text-sm font-medium text-white">
                فاحص<span className="text-sky-400">.</span>
                <span className="block text-[10px] font-normal text-neutral-500">لوحة الإدارة</span>
              </span>
            )}
          </div>

          <div className="my-3 h-px bg-white/10" />
          {nav}

          <div className="mt-auto flex flex-col gap-2">
            {/* The dual-role switch. Offered to owners only — a plain admin has
                no inspector line of business, and the API refuses them anyway. */}
            {tier === 'super_admin' && <InspectorViewToggle collapsed={collapsed} />}
            <div
              className={cn(
                'rounded-xl border border-white/10 bg-white/[.03] p-2.5',
                collapsed && 'flex justify-center p-2',
              )}
              title={tier === 'super_admin' ? 'دخول بصلاحيات المالك' : 'جلسة إدارة مرتفعة'}
            >
              {tier === 'super_admin' ? (
                <Crown className="size-4 text-amber-300" />
              ) : (
                <ShieldCheck className="size-4 text-sky-300" />
              )}
              {!collapsed && (
                <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                  {tier === 'super_admin' ? 'صلاحيات المالك الكاملة' : 'مدير — بوابة الرمز مطبّقة'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[10px] text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
            >
              {collapsed ? <ChevronLeft className="size-3" /> : <ChevronRight className="size-3" />}
              {!collapsed && 'تصغير'}
            </button>
          </div>
        </aside>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              key="mobile-drawer"
              className="fixed inset-0 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <motion.div
                className="absolute inset-0 bg-neutral-950/70 backdrop-blur-sm"
                onClick={() => setMobileOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.aside
                // `max-w-[85vw]` keeps a strip of the page visible on a 320px
                // phone so the drawer reads as an overlay, not a page swap.
                className="absolute inset-y-0 right-0 flex w-64 max-w-[85vw] flex-col overflow-y-auto border-l border-white/10 bg-neutral-950/95 p-4 backdrop-blur-2xl"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              >
                <div className="mb-4 flex items-center gap-2.5">
                  <BrandMark className="size-8 shrink-0 object-contain" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">لوحة الإدارة</span>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="إغلاق القائمة"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {nav}
                {/* Identity lives at the foot of the drawer so the header can stay
                    lean on phones. Safe-area padding clears the home indicator. */}
                <div className="mt-auto flex flex-col gap-2 pt-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                  {tier === 'super_admin' && <InspectorViewToggle />}
                  <GlassBadge tone={tier === 'super_admin' ? 'warn' : 'good'} className="justify-center">
                    <StatusDot tone={tier === 'super_admin' ? 'warn' : 'good'} pulse />
                    {adminName}
                  </GlassBadge>
                  <LogoutButton />
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="rc-min-0 flex flex-1 flex-col pb-16">
          {/* Padding lives on the header and the content wrapper rather than on
              `main`, so the sticky header can span edge-to-edge without the
              negative-margin trick (which fought the safe-area insets). */}
          <header className="rc-shell-pad sticky top-0 z-30 mb-4 border-b border-white/10 bg-neutral-950/80 py-2.5 backdrop-blur-2xl sm:py-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-neutral-300 transition-colors hover:bg-white/10 lg:hidden"
                aria-label="فتح القائمة"
              >
                <LayoutDashboard className="size-4" />
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-sky-400">{current.subtitle}</p>
                <h1 className="truncate text-base font-medium text-white sm:text-lg">{current.label}</h1>
              </div>

              {/* Quick stats only earn their space once the header is wide. */}
              <div className="hidden items-center gap-2 xl:flex">
                {stats.map((stat) => (
                  <GlassBadge key={stat.label} tone={stat.tone}>
                    <span className="font-medium">{stat.value}</span>
                    <span className="opacity-70">{stat.label}</span>
                  </GlassBadge>
                ))}
              </div>

              {/* Action cluster: `shrink-0` so a long page title can never
                  squash the palette trigger or the logout control. */}
              <div className="flex shrink-0 items-center gap-2">
                <CommandPaletteTrigger />

                <GlassBadge
                  tone={tier === 'super_admin' ? 'warn' : 'good'}
                  className="hidden max-w-[10rem] md:inline-flex"
                >
                  <StatusDot tone={tier === 'super_admin' ? 'warn' : 'good'} pulse />
                  <span className="truncate">{adminName}</span>
                </GlassBadge>

                <LogoutButton />
              </div>
            </div>
          </header>

          <div className="rc-shell-pad flex-1">{children}</div>
        </main>
      </div>
    </div>
  )
}
