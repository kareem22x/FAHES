import Link from 'next/link'
import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CarFront,
  CircleHelp,
  ClipboardCheck,
  FileText,
  MapPin,
  ShieldCheck,
  Star,
  WalletCards,
} from 'lucide-react'
import BrandMark from '@/components/brand-mark'
import { LogoutButton } from '@/components/logout-button'
import { SurfaceExit } from '@/components/admin/surface-exit'
import InspectorDashboardHeader from '@/components/modules/inspector/dashboard-header'
import type { AppNotification } from '@/lib/notifications/store'
import { maskPhone } from '@/lib/phone'

/**
 * The inspector workspace shell: sidebar, topbar and mobile nav.
 *
 * ── Why this was extracted ─────────────────────────────────────────────────
 *
 * It used to live inline inside `app/inspector/dashboard/page.tsx`. Adding a
 * second page to the same workspace (`/inspector/settings`) would have meant
 * copying ~60 lines of chrome, and the copy would drift: the sidebar badge, the
 * surface-exit control and the notification bell all have to stay in step.
 *
 * ── Why the nav links are absolute ─────────────────────────────────────────
 *
 * The original list mixed real routes (`/inspector/dashboard`) with bare
 * in-page anchors (`#requests`, `#assigned`). That works only while the nav is
 * rendered on `/inspector/dashboard` itself — on any other page in the shell a
 * bare `#anchor` silently does nothing. Every anchor is now qualified with its
 * owning route, so the nav is correct from anywhere in the workspace.
 */

export type InspectorNavKey =
  | 'home'
  | 'requests'
  | 'assigned'
  | 'schedule'
  | 'reports'
  | 'earnings'
  | 'ratings'
  | 'notifications'
  | 'profile'
  | 'verification'
  | 'support'

const NAV: { key: InspectorNavKey; href: string; label: string; icon: typeof MapPin }[] = [
  { key: 'home', href: '/inspector/dashboard', label: 'الرئيسية', icon: BriefcaseBusiness },
  { key: 'requests', href: '/inspector/dashboard#requests', label: 'طلبات الفحص', icon: ClipboardCheck },
  { key: 'assigned', href: '/inspector/dashboard#assigned', label: 'الفحوصات المسندة', icon: CarFront },
  { key: 'schedule', href: '/inspector/dashboard#schedule', label: 'المواعيد', icon: CalendarDays },
  { key: 'reports', href: '/inspector/dashboard#reports', label: 'التقارير', icon: FileText },
  { key: 'earnings', href: '/inspector/dashboard#earnings', label: 'الأرباح', icon: WalletCards },
  { key: 'ratings', href: '/inspector/dashboard#ratings', label: 'التقييمات', icon: Star },
  { key: 'notifications', href: '/inspector/dashboard#notifications', label: 'الإشعارات', icon: Bell },
  { key: 'profile', href: '/inspector/settings', label: 'الملف الشخصي', icon: MapPin },
  { key: 'verification', href: '/inspector/dashboard#verification', label: 'حالة الاعتماد', icon: ShieldCheck },
  { key: 'support', href: '/inspector/dashboard#support', label: 'المساعدة', icon: CircleHelp },
]

export function InspectorShell({
  active,
  breadcrumb,
  description,
  name,
  phone,
  phoneVerified,
  isOnline,
  notifications,
  unread,
  pendingRequests = 0,
  ownerSurface = false,
  children,
}: {
  active: InspectorNavKey
  breadcrumb: string
  description: string
  name: string
  phone: string | null
  /** Drives the badge in the profile popover. Not cosmetic — it is the only
   *  place an inspector learns their number is still unverified. */
  phoneVerified: boolean
  isOnline: boolean
  notifications: AppNotification[]
  unread: number
  /** Drives the sidebar badge on «طلبات الفحص». */
  pendingRequests?: number
  /** True when a platform owner is standing in the inspector surface. */
  ownerSurface?: boolean
  children: React.ReactNode
}) {
  return (
    <main dir="rtl" className="inspector-dashboard">
      <div className="inspector-dashboard-layout">
        <aside className="inspector-sidebar" aria-label="التنقل في لوحة موظف الفحص">
          <Link href="/" className="inspector-logo">
            <BrandMark className="inspector-logo-mark" />
            <span>فاحص<span>.</span><small>لوحة موظف الفحص</small></span>
          </Link>

          <p className="inspector-nav-caption">مساحة العمل</p>
          <nav>
            {NAV.map(({ key, href, label, icon: Icon }) => (
              <Link key={key} href={href} className={active === key ? 'is-current' : ''}>
                <Icon size={17} />{label}
                {key === 'requests' && pendingRequests > 0 && (
                  <span className="inspector-nav-count">{pendingRequests}</span>
                )}
              </Link>
            ))}
          </nav>

          <div className="inspector-sidebar-help">
            <span><CircleHelp size={18} /></span>
            <strong>تحتاج مساعدة؟</strong>
            <p>راجع إعدادات مدن العمل أو تواصل مع إدارة المنصة.</p>
            <Link href="/inspector/dashboard#support">مركز المساعدة <ArrowLeft size={14} /></Link>
          </div>
          <div className="inspector-sidebar-user">
            <span className="inspector-user-avatar">{name.slice(0, 1)}</span>
            <span>
              <strong>{name}</strong>
              <small>موظف فحص · {maskPhone(phone)}</small>
            </span>
            <LogoutButton />
          </div>
        </aside>

        <div className="inspector-workspace">
          <header className="inspector-topbar">
            <div>
              <div className="inspector-breadcrumb">
                <span>فاحص</span><span>/</span><strong>{breadcrumb}</strong>
              </div>
              <p className="inspector-topbar-description">{description}</p>
            </div>
            <div className="inspector-topbar-actions">
              {/* Only an owner standing in the inspector surface sees this. A real
                  inspector has no admin console to return to. */}
              {ownerSurface && <SurfaceExit />}
              <span className={`inspector-status-pill ${isOnline ? 'is-online' : ''}`}>
                <span />{isOnline ? 'متصل' : 'غير متاح'}
              </span>
              <InspectorDashboardHeader
                initialNotifications={notifications}
                initialUnread={unread}
                name={name}
                phone={phone ?? ''}
                verified={phoneVerified}
              />
            </div>
          </header>

          <div className="inspector-content">{children}</div>

          <nav className="inspector-mobile-nav" aria-label="التنقل السريع">
            {NAV.slice(0, 4).map(({ key, href, label, icon: Icon }) => (
              <Link key={key} href={href} className={active === key ? 'is-current' : ''}>
                <Icon size={19} /><span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </main>
  )
}
