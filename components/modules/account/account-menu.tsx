'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useClerk, useUser } from '@clerk/nextjs'
import {
  BadgeCheck,
  CarFront,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
  Wrench,
} from 'lucide-react'

export type AccountRole = 'customer' | 'inspector' | 'admin' | 'admin_pending'

type AccountLink = {
  href: string
  label: string
  hint: string
  icon: typeof CarFront
}

/**
 * Links are derived from the role the server resolved for this session, so an
 * inspector never sees customer-only destinations. On the public landing page
 * the role is unknown, which is why every link there points at /dashboard:
 * that route re-routes the visitor to the workspace their role owns.
 */
function linksForRole(role: AccountRole): AccountLink[] {
  if (role === 'admin') {
    return [
      { href: '/admin', label: 'لوحة الإدارة', hint: 'نظرة عامة على المنصة', icon: LayoutDashboard },
      { href: '/admin/users', label: 'المستخدمون', hint: 'حسابات العملاء والفاحصين', icon: UserRound },
      { href: '/admin/inspectors', label: 'طلبات الفاحصين', hint: 'مراجعة الاعتماد', icon: BadgeCheck },
    ]
  }

  if (role === 'admin_pending') {
    return [
      { href: '/admin/gate', label: 'بوابة الإدارة', hint: 'تأكيد إضافي مطلوب', icon: ShieldCheck },
      { href: '/dashboard', label: 'طلباتي', hint: 'متابعة طلبات الفحص', icon: CarFront },
    ]
  }

  if (role === 'inspector') {
    return [
      { href: '/inspector/dashboard', label: 'لوحة الفاحص', hint: 'الطلبات المتاحة ومواعيدك', icon: Wrench },
      { href: '/inspector/dashboard#assigned', label: 'مهامي الحالية', hint: 'الطلبات المسندة إليك', icon: CarFront },
      { href: '/inspector/dashboard#reports', label: 'تقاريري', hint: 'تقارير الفحوص المكتملة', icon: BadgeCheck },
    ]
  }

  return [
    { href: '/dashboard/requests', label: 'طلباتي', hint: 'كل طلبات الفحص وعروضها', icon: CarFront },
    { href: '/dashboard', label: 'لوحة التحكم', hint: 'ملخص حسابك ونشاطك', icon: LayoutDashboard },
    { href: '/dashboard/reports', label: 'تقاريري', hint: 'تقارير الفحص الجاهزة', icon: BadgeCheck },
  ]
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  return parts.slice(0, 2).map((part) => Array.from(part)[0]).join('')
}

/**
 * Where «ملفي الشخصي» goes, per role.
 *
 * ── Why this is not one URL ────────────────────────────────────────────────
 *
 * A profile is a *screen inside a workspace*, and the role decides which one.
 * Every role used to be sent to the standalone `/account`, which renders
 * `AccountProfile` on the marketing shell (`SiteHeader`) — so a customer left
 * their dashboard, and an inspector left their workspace, to look at their own
 * name on a page whose primary button only bounced them back. Both now land on
 * the same component framed by the shell they were already in:
 *
 *   * `/dashboard/profile`   — the identical `AccountProfile`, in the customer shell
 *   * `/inspector/settings`  — work scope + identity, in the inspector shell
 *   * `/admin/settings`      — «حسابي», in the admin console (support agents are
 *                              admins here, so they land on the same screen)
 *   * `/account`             — for `admin_pending`, who has no console yet
 *
 * The default (`'customer'`) is what the public header passes, where the role
 * is genuinely unknown. `/dashboard/profile` re-routes a non-customer to the
 * console their role owns, so the guess is safe.
 */
function profileHrefForRole(role: AccountRole) {
  if (role === 'inspector') return '/inspector/settings'
  if (role === 'customer') return '/dashboard/profile'
  if (role === 'admin') return '/admin/settings'
  return '/account'
}

/** Clears the elevated-admin cookie, then ends the Clerk session. */
function useEndSession() {
  const { signOut } = useClerk()
  return useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // The Clerk session still has to end even if the cookie cleanup failed.
    }
    await signOut({ redirectUrl: '/login' })
  }, [signOut])
}

function AccountAvatar({ imageUrl, name, className }: { imageUrl?: string; name: string; className: string }) {
  if (imageUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- Clerk serves an already-optimized avatar from its own CDN. */
      <img src={imageUrl} alt="" className={className} referrerPolicy="no-referrer" />
    )
  }
  return <span className={`${className} account-avatar-fallback`} aria-hidden="true">{initialsOf(name)}</span>
}

export function AccountMenu({ role = 'customer' }: { role?: AccountRole }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const endSession = useEndSession()

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(true)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  const logout = useCallback(async () => {
    setSigningOut(true)
    await endSession()
  }, [endSession])

  if (!isLoaded) {
    return <span className="account-skeleton" aria-hidden="true" />
  }

  if (!isSignedIn) {
    return (
      <Link href="/login" className="site-login account-signin">
        تسجيل الدخول
      </Link>
    )
  }

  const name = user.fullName?.trim() || user.firstName || 'حسابي'
  const contact = user.primaryEmailAddress?.emailAddress || user.primaryPhoneNumber?.phoneNumber || 'حساب فاحص'
  const links = linksForRole(role)

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`account-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('a, button')?.focus())
          }
        }}
      >
        <span className="account-trigger-text">
          <strong>{name}</strong>
          <small>{role === 'inspector' ? 'فاحص معتمد' : role === 'admin' ? 'مشرف' : 'حساب عميل'}</small>
        </span>
        <AccountAvatar imageUrl={user.imageUrl} name={name} className="account-avatar" />
        <ChevronDown className="account-chevron" size={15} aria-hidden="true" />
      </button>

      {open && (
        <div className="account-dropdown" id={menuId} role="menu" ref={menuRef} aria-label="قائمة الحساب">
          <div className="account-dropdown-head">
            <AccountAvatar imageUrl={user.imageUrl} name={name} className="account-avatar account-avatar-lg" />
            <div>
              <strong>{name}</strong>
              <small dir="ltr">{contact}</small>
            </div>
          </div>

          <div className="account-dropdown-links">
            {links.map(({ href, label, hint, icon: Icon }) => (
              <Link key={href} href={href} role="menuitem" onClick={() => close()}>
                <span className="account-link-icon"><Icon size={17} /></span>
                <span className="account-link-text">
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </Link>
            ))}
          </div>

          <div className="account-dropdown-foot">
            <Link href={profileHrefForRole(role)} role="menuitem" onClick={() => close()}>
              <span className="account-link-icon"><UserRound size={16} /></span>
              <span className="account-link-text"><strong>ملفي الشخصي</strong><small>البيانات والأمان</small></span>
            </Link>
            <button type="button" role="menuitem" onClick={logout} disabled={signingOut}>
              <span className="account-link-icon account-link-icon-danger"><LogOut size={16} /></span>
              <span className="account-link-text"><strong>{signingOut ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</strong><small>إنهاء الجلسة على هذا الجهاز</small></span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Expanded variant used inside the mobile menu panel, where a dropdown would clip. */
export function AccountMenuInline({ role = 'customer' }: { role?: AccountRole }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const endSession = useEndSession()

  if (!isLoaded) return null

  if (!isSignedIn || !user) {
    return <Link href="/login" className="site-mobile-account">تسجيل الدخول إلى حسابك</Link>
  }

  const name = user.fullName?.trim() || user.firstName || 'حسابي'

  return (
    <div className="site-mobile-account-card">
      <div className="site-mobile-account-head">
        <AccountAvatar imageUrl={user.imageUrl} name={name} className="account-avatar" />
        <div><strong>{name}</strong><small>{role === 'inspector' ? 'فاحص معتمد' : 'حساب عميل'}</small></div>
      </div>
      {linksForRole(role).map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href}><Icon size={16} />{label}</Link>
      ))}
      <Link href={profileHrefForRole(role)}><UserRound size={16} />ملفي الشخصي</Link>
      <button type="button" onClick={() => void endSession()}><LogOut size={16} />تسجيل الخروج</button>
    </div>
  )
}
