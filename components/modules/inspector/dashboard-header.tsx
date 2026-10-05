'use client'

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { useTheme } from 'next-themes'
import {
  BadgeCheck,
  Bell,
  BellRing,
  CheckCheck,
  ChevronDown,
  LogOut,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react'
import type { AppNotification } from '@/lib/notifications/store'

/**
 * The inspector dashboard header: notifications bell + profile quick menu.
 *
 * Both controls are popovers anchored in the topbar. They are deliberately built
 * here rather than reusing the public `AccountMenu`, because this surface is RTL
 * inside a fixed-height topbar and needs the notification feed, the phone
 * verification badge and a theme toggle that the public menu does not carry.
 *
 * ── The chime ────────────────────────────────────────────────────────────────
 *
 * New alerts are detected by polling `/api/notifications` and comparing the unread
 * count against the last one seen. A rise plays a short WebAudio tone and fires a
 * vibration where the device supports it. Browsers refuse to start an AudioContext
 * before a user gesture, so the context is created lazily and any failure is
 * swallowed — a blocked chime must never break the bell.
 */

const POLL_INTERVAL_MS = 30_000

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '؟'
  return parts.slice(0, 2).map((part) => Array.from(part)[0]).join('')
}

function playChime() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const context = new Ctor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    oscillator.frequency.setValueAtTime(1180, context.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.36)
    oscillator.onended = () => void context.close().catch(() => {})
  } catch {
    // Autoplay policy or an unsupported context — the badge still updates.
  }
}

function relativeTime(ms: number) {
  const diff = Date.now() - ms
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `قبل ${minutes} دقيقة`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `قبل ${hours} ساعة`
  const days = Math.round(hours / 24)
  return `قبل ${days} يوم`
}

const severityTone: Record<AppNotification['severity'], string> = {
  info: 'bg-sky-50 text-sky-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  critical: 'bg-rose-50 text-rose-600',
}

export default function InspectorDashboardHeader({
  initialNotifications,
  initialUnread,
  name,
  phone,
  verified,
}: {
  initialNotifications: AppNotification[]
  initialUnread: number
  name: string
  phone: string
  verified: boolean
}) {
  const { signOut } = useClerk()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [notifications, setNotifications] = useState(initialNotifications)
  const [unread, setUnread] = useState(initialUnread)
  const [bellOpen, setBellOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const bellRootRef = useRef<HTMLDivElement>(null)
  const menuRootRef = useRef<HTMLDivElement>(null)
  const bellPanelId = useId()
  const menuPanelId = useId()
  const lastUnread = useRef(initialUnread)
  /**
   * "Have we hydrated yet?" — needed because the theme icon must not be chosen
   * during SSR, where `next-themes` has not resolved the stored preference.
   *
   * This used to be `useState(false)` plus `useEffect(() => setMounted(true), [])`.
   * That is the common idiom, but it schedules a second render on every mount and
   * React's linter flags it as a cascading render (`react-hooks/set-state-in-effect`).
   * `useSyncExternalStore` asks the same question without a state write: the
   * server snapshot is `false`, the client snapshot is `true`, and the empty
   * subscribe function is correct because hydration happens exactly once and
   * never needs to notify.
   */
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' })
      if (!response.ok) return
      const payload = (await response.json()) as { notifications?: AppNotification[]; unread?: number }
      const nextUnread = payload.unread ?? 0
      if (nextUnread > lastUnread.current) {
        playChime()
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.([40, 60, 40])
        }
      }
      lastUnread.current = nextUnread
      setUnread(nextUnread)
      if (payload.notifications) setNotifications(payload.notifications)
    } catch {
      // Offline or transient failure — keep the last good state.
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!bellOpen && !menuOpen) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (!bellRootRef.current?.contains(target)) setBellOpen(false)
      if (!menuRootRef.current?.contains(target)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setBellOpen(false)
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [bellOpen, menuOpen])

  const markAllRead = useCallback(async () => {
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? Date.now() })))
    setUnread(0)
    lastUnread.current = 0
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    } catch {
      // Optimistic update stands; the next poll reconciles.
    }
  }, [])

  const logout = useCallback(async () => {
    setSigningOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // The Clerk session must end regardless of the cookie cleanup.
    }
    await signOut({ redirectUrl: '/login' })
  }, [signOut])

  const isDark = (theme === 'system' ? resolvedTheme : theme) === 'dark'

  return (
    <div className="flex items-center gap-2.5" dir="rtl">
      {/* ── Notifications ─────────────────────────────────────────────────── */}
      <div className="relative" ref={bellRootRef}>
        <button
          type="button"
          className="inspector-icon-button relative"
          aria-label={`الإشعارات${unread > 0 ? ` — ${unread} غير مقروء` : ''}`}
          aria-haspopup="dialog"
          aria-expanded={bellOpen}
          aria-controls={bellOpen ? bellPanelId : undefined}
          onClick={() => {
            setBellOpen((value) => !value)
            setMenuOpen(false)
          }}
        >
          {unread > 0 ? <BellRing size={17} /> : <Bell size={17} />}
          {unread > 0 && (
            <span className="absolute -top-1 -left-1 grid min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-[16px] text-white">
              {unread > 9 ? '٩+' : unread}
            </span>
          )}
        </button>

        {bellOpen && (
          <div
            id={bellPanelId}
            role="dialog"
            aria-label="الإشعارات"
            className="absolute left-0 top-[calc(100%+10px)] z-50 w-[330px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-white/70 bg-white/85 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#e3eaf2] px-3.5 py-3">
              <strong className="text-[12px] text-[#102444]">الإشعارات</strong>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[#0b5cad] transition hover:bg-[#eef4fb]"
                >
                  <CheckCheck size={13} />
                  تعليم الكل كمقروء
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-[11px] text-[#788699]">لا توجد إشعارات حتى الآن.</p>
              ) : (
                notifications.map((item) => {
                  const inner = (
                    <>
                      <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${severityTone[item.severity]}`}>
                        {item.severity === 'critical' ? <ShieldAlert size={14} /> : <Bell size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <strong className="truncate text-[11px] text-[#102444]">{item.title}</strong>
                          {item.readAt === null && <span className="size-1.5 shrink-0 rounded-full bg-sky-500" />}
                        </span>
                        {item.body && <span className="mt-0.5 block truncate text-[10px] text-[#65768d]">{item.body}</span>}
                        <span className="mt-0.5 block text-[9px] text-[#9aa7b8]">{relativeTime(item.createdAt)}</span>
                      </span>
                    </>
                  )
                  return item.href ? (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setBellOpen(false)}
                      className={`flex items-start gap-2.5 px-3.5 py-2.5 transition hover:bg-[#f5f9ff] ${item.readAt === null ? 'bg-[#f8fbff]' : ''}`}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={item.id} className={`flex items-start gap-2.5 px-3.5 py-2.5 ${item.readAt === null ? 'bg-[#f8fbff]' : ''}`}>
                      {inner}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Profile quick menu ────────────────────────────────────────────── */}
      <div className="relative" ref={menuRootRef}>
        <button
          type="button"
          className="inspector-icon-button"
          aria-label="قائمة الحساب"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuPanelId : undefined}
          onClick={() => {
            setMenuOpen((value) => !value)
            setBellOpen(false)
          }}
        >
          <UserRound size={17} />
        </button>

        {menuOpen && (
          <div
            id={menuPanelId}
            role="menu"
            aria-label="قائمة الحساب"
            className="absolute left-0 top-[calc(100%+10px)] z-50 w-[290px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-white/70 bg-white/85 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 border-b border-[#e3eaf2] px-4 py-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e5ede6] text-[13px] font-bold text-[#0b1f46]">
                {initialsOf(name)}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-[12px] text-[#102444]">{name}</strong>
                <small dir="ltr" className="block text-[10px] text-[#65768d]">{phone || 'رقم غير مضاف'}</small>
              </div>
            </div>

            <div className="px-4 py-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ring-1 ring-inset ${
                  verified
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-amber-50 text-amber-700 ring-amber-200'
                }`}
              >
                {verified ? <BadgeCheck size={13} /> : <ShieldAlert size={13} />}
                {verified ? 'الجوال موثّق' : 'الجوال غير موثّق'}
              </span>
            </div>

            <div className="border-t border-[#e3eaf2] py-1">
              {/* Two destinations, not one, because they are two different things.
                  The profile lives inside the inspector workspace (work scope,
                  availability, verification state); the security settings are
                  account-level facts shared by every role and stay at /account.
                  Both used to point at /account, which dropped the inspector out
                  of their own shell for a screen whose main action bounces back. */}
              <Link
                href="/inspector/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[11px] text-[#33465f] transition hover:bg-[#f5f9ff]"
              >
                <UserRound size={15} />
                الملف الشخصي والإعدادات
              </Link>

              <Link
                href="/account"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[11px] text-[#33465f] transition hover:bg-[#f5f9ff]"
              >
                <ShieldCheck size={15} />
                إعدادات الأمان والتحقق
              </Link>

              <button
                type="button"
                role="menuitem"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[11px] text-[#33465f] transition hover:bg-[#f5f9ff]"
              >
                {mounted && isDark ? <Sun size={15} /> : <Moon size={15} />}
                {mounted && isDark ? 'التبديل إلى المظهر الفاتح' : 'التبديل إلى المظهر الداكن'}
              </button>
            </div>

            <div className="border-t border-[#e3eaf2] py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => void logout()}
                disabled={signingOut}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[11px] text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
              >
                <LogOut size={15} />
                {signingOut ? 'جارٍ الخروج…' : 'تسجيل الخروج'}
              </button>
            </div>
          </div>
        )}
      </div>

      <ChevronDown size={13} className="hidden text-[#9aa7b8] sm:block" aria-hidden="true" />
    </div>
  )
}
