'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import {
  Activity,
  CarFront,
  CornerDownLeft,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Search,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Command = {
  id: string
  label: string
  group: string
  icon: React.ReactNode
  run: () => void
  keywords?: string
}

/**
 * Ctrl/Cmd+K command palette.
 *
 * Hand-rolled rather than pulled from a library: the project has no Radix
 * dependency, and the whole surface is a listbox with an input — cheaper to
 * write than to add a dependency for. Focus is trapped while open and the
 * trigger also works from the sidebar button.
 */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      setOpen(false)
      router.push(href)
    }
    return [
      { id: 'overview', label: 'نظرة عامة', group: 'تنقّل', icon: <LayoutDashboard className="size-3.5" />, run: go('/admin') },
      { id: 'inspections', label: 'طلبات الفحص', group: 'تنقّل', icon: <CarFront className="size-3.5" />, run: go('/admin/inspections'), keywords: 'requests orders' },
      { id: 'inspectors', label: 'الفاحصون', group: 'تنقّل', icon: <ShieldCheck className="size-3.5" />, run: go('/admin/inspectors') },
      { id: 'users', label: 'المستخدمون', group: 'تنقّل', icon: <UsersRound className="size-3.5" />, run: go('/admin/users'), keywords: 'accounts' },
      { id: 'support', label: 'الدعم الفني', group: 'تنقّل', icon: <LifeBuoy className="size-3.5" />, run: go('/admin/support'), keywords: 'support tickets' },
      { id: 'audit', label: 'سجل التدقيق', group: 'تنقّل', icon: <ScrollText className="size-3.5" />, run: go('/admin/audit-logs'), keywords: 'audit logs' },
      { id: 'security', label: 'الأمان', group: 'تنقّل', icon: <Activity className="size-3.5" />, run: go('/admin/security') },
      { id: 'site', label: 'الموقع العام', group: 'انتقال', icon: <ExternalLink className="size-3.5" />, run: go('/') },
      { id: 'dashboard', label: 'لوحة العميل', group: 'انتقال', icon: <ExternalLink className="size-3.5" />, run: go('/dashboard') },
    ]
  }, [router])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase().includes(needle),
    )
  }, [commands, query])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
        return
      }
      if (!open) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((current) => Math.min(current + 1, results.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((current) => Math.max(current - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        results[active]?.run()
      }
    }
    function onOpenEvent() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('admin:command-palette', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('admin:command-palette', onOpenEvent)
    }
  }, [open, results, active])

  // Reset the query/selection each time the palette opens. Done during render
  // (React's documented "adjust state when an input changes" pattern) so the
  // effect below is left with nothing but real external-system work: focus and
  // body scroll lock.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setActive(0)
    }
  }

  useEffect(() => {
    if (!open) return
    // Focus after paint so the input exists.
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="command-backdrop"
          className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-950/70 p-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <motion.div
            key="command-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="لوحة الأوامر"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/95 shadow-2xl backdrop-blur-2xl"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Search className="size-4 shrink-0 text-neutral-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                placeholder="اكتب أمرًا أو انتقل إلى…"
                className="w-full bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
              />
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-500">ESC</kbd>
            </div>

            <ul role="listbox" className="max-h-[320px] overflow-y-auto p-2">
              {results.length === 0 && (
                <li className="px-3 py-8 text-center text-xs text-neutral-500">لا نتائج</li>
              )}
              {results.map((command, index) => (
                <li key={command.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={command.run}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right text-xs transition-colors',
                      index === active ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5',
                    )}
                  >
                    <span className="text-neutral-500">{command.icon}</span>
                    <span className="flex-1">{command.label}</span>
                    <span className="text-[10px] text-neutral-600">{command.group}</span>
                    {index === active && <CornerDownLeft className="size-3 text-neutral-500" />}
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-neutral-600">
              <span>↑ ↓ للتنقل · Enter للاختيار</span>
              <span>Ctrl / ⌘ + K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Small button that opens the palette; lives in the shell header. */
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('admin:command-palette'))}
      className="hidden items-center gap-2 rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 text-[11px] text-[#64748b] transition-colors hover:border-[#bfdbfe] hover:bg-[#eff6ff] hover:text-[#2563eb] sm:flex"
    >
      <Search className="size-3" />
      بحث سريع
      <kbd className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-1.5 py-0.5 text-[10px] text-[#94a3b8]">Ctrl K</kbd>
    </button>
  )
}
