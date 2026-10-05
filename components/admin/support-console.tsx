'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock, Download, Inbox, Loader2, Search, Star, TrendingUp } from 'lucide-react'
import { EmptyState, GlassBadge, GlassPanel } from '@/components/admin/ui/glass'
import { bulkTicketAction, type SupportActionState } from '@/lib/support/admin-actions'
import {
  categoryLabels,
  priorityLabels,
  priorityOrder,
  statusOrder,
  ticketStatusLabels,
  ticketStatusTone,
} from '@/lib/support/labels'
import type { SupportStats, SupportTicket, TicketPriority, TicketStatus } from '@/lib/support/store'

/**
 * The centralized support console (features 16–24).
 *
 * Filtering is client-side over the tickets the server already loaded: the console
 * caps at a few hundred rows, so an instant filter beats a round-trip per keystroke.
 */

/**
 * Fill colour per priority, for the distribution bar.
 *
 * Written as a static map rather than built from the value with a template
 * literal: Tailwind scans source text, so `bg-${tone}-500` produces no CSS at
 * all and the bar would render invisible.
 */
const PRIORITY_BAR: Record<TicketPriority, string> = {
  critical: 'bg-rose-500',
  high: 'bg-amber-500',
  medium: 'bg-sky-500',
  low: 'bg-slate-300',
}

const PRIORITY_DOT: Record<TicketPriority, string> = {
  critical: 'bg-rose-500',
  high: 'bg-amber-500',
  medium: 'bg-sky-500',
  low: 'bg-slate-300',
}

function slaState(ticket: SupportTicket, now: number) {
  if (ticket.firstResponseAt !== null || ['resolved', 'closed'].includes(ticket.status)) return null
  if (ticket.slaDueAt === null) return null
  const overdueMinutes = Math.floor((now - ticket.slaDueAt) / 60_000)
  if (overdueMinutes >= 0) return { breached: true, minutes: overdueMinutes }
  return { breached: false, minutes: Math.abs(overdueMinutes) }
}

function playUrgentAlert() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const context = new Ctor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(660, context.currentTime)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.52)
    oscillator.onended = () => void context.close().catch(() => {})
  } catch {
    // Autoplay policy — the visual alert still shows.
  }
}

export default function SupportConsole({
  tickets,
  stats,
}: {
  tickets: SupportTicket[]
  stats: SupportStats
}) {
  const [state, formAction, pending] = useActionState<SupportActionState, FormData>(bulkTicketAction, {
    ok: false,
    message: '',
  })

  const [now, setNow] = useState(() => Date.now())
  const [status, setStatus] = useState<TicketStatus | 'all'>('all')
  const [priority, setPriority] = useState<TicketPriority | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const alerted = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  // Critical tickets play an urgent tone once per visit (feature 37).
  useEffect(() => {
    if (alerted.current) return
    if (stats.criticalOpen > 0) {
      alerted.current = true
      const timer = window.setTimeout(() => playUrgentAlert(), 400)
      return () => window.clearTimeout(timer)
    }
  }, [stats.criticalOpen])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (status !== 'all' && ticket.status !== status) return false
      if (priority !== 'all' && ticket.priority !== priority) return false
      if (needle && !`${ticket.subject} ${ticket.ticketNumber}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [tickets, status, priority, query])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = filtered.length > 0 && filtered.every((ticket) => selected.has(ticket.id))

  // Summed from the distribution itself, not from the status counters, so the
  // bar widths and the "N تذكرة" caption can never disagree with each other.
  const openTotal = priorityOrder.reduce((sum, value) => sum + stats.openByPriority[value], 0)

  return (
    <div className="flex flex-col gap-4">
      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Inbox size={15} />} label="تذاكر مفتوحة" value={stats.open} tone="text-rose-600" />
        <StatCard icon={<Clock size={15} />} label="قيد المعالجة" value={stats.inProgress} tone="text-amber-600" />
        <StatCard
          icon={<TrendingUp size={15} />}
          label="متوسط أول رد"
          value={stats.avgFirstResponseMinutes === null ? '—' : `${stats.avgFirstResponseMinutes} د`}
          tone="text-sky-600"
        />
        <StatCard
          icon={<Star size={15} />}
          label="متوسط الرضا"
          value={stats.avgSatisfaction === null ? '—' : `${stats.avgSatisfaction}/٥`}
          tone="text-emerald-600"
        />
      </div>

      {/* ── Priority distribution ─────────────────────────────────────────── */}
      <GlassPanel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <strong className="text-[12px] text-[#102444]">توزيع الأولويات — التذاكر غير المغلقة</strong>
          <span className="text-[10px] text-[#65768d]">{openTotal} تذكرة</span>
        </div>

        {openTotal === 0 ? (
          <p className="mt-3 text-[11px] text-[#788699]">لا توجد تذاكر مفتوحة حاليًا.</p>
        ) : (
          <>
            <div
              className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-[#eef2f7]"
              role="img"
              aria-label={priorityOrder
                .map((value) => `${priorityLabels[value]}: ${stats.openByPriority[value]}`)
                .join('، ')}
            >
              {priorityOrder.map((value) => {
                const count = stats.openByPriority[value]
                if (count === 0) return null
                return (
                  <span
                    key={value}
                    className={PRIORITY_BAR[value]}
                    style={{ width: `${(count / openTotal) * 100}%` }}
                  />
                )
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {priorityOrder.map((value) => (
                <span key={value} className="inline-flex items-center gap-1.5 text-[10px] text-[#475d78]">
                  <span className={`size-2 rounded-full ${PRIORITY_DOT[value]}`} aria-hidden="true" />
                  {priorityLabels[value]}
                  <strong className="text-[#102444]">{stats.openByPriority[value]}</strong>
                </span>
              ))}
            </div>
          </>
        )}
      </GlassPanel>

      {stats.slaBreached > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-800">
          <AlertTriangle size={16} />
          <span>
            <strong>{stats.slaBreached}</strong> تذكرة تجاوزت اتفاقية مستوى الخدمة دون رد أول. راجع التذاكر المميّزة بالأحمر.
          </span>
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <GlassPanel className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa7b8]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ابحث بالعنوان أو رقم التذكرة…"
              className="w-full rounded-lg border border-[#e3eaf2] py-2 pr-9 pl-3 text-[12px] outline-none focus:border-[#93c5fd]"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as TicketStatus | 'all')}
            className="rounded-lg border border-[#e3eaf2] bg-white px-3 py-2 text-[11px] text-[#33465f] outline-none"
          >
            <option value="all">كل الحالات</option>
            {statusOrder.map((value) => (
              <option key={value} value={value}>{ticketStatusLabels[value]}</option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as TicketPriority | 'all')}
            className="rounded-lg border border-[#e3eaf2] bg-white px-3 py-2 text-[11px] text-[#33465f] outline-none"
          >
            <option value="all">كل الأولويات</option>
            {priorityOrder.map((value) => (
              <option key={value} value={value}>{priorityLabels[value]}</option>
            ))}
          </select>
          <a
            href="/api/admin/support/export"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e3eaf2] bg-white px-3 py-2 text-[11px] font-medium text-[#475d78] transition hover:bg-slate-50"
          >
            <Download size={14} />
            تصدير CSV
          </a>
        </div>
      </GlassPanel>

      {/* ── Bulk operations + table ───────────────────────────────────────── */}
      <form action={formAction}>
        <GlassPanel className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#eef3f9] px-4 py-3">
            <span className="text-[11px] text-[#65768d]">
              {selected.size > 0 ? `${selected.size} محددة` : `${filtered.length} تذكرة`}
            </span>
            <div className="flex-1" />
            <select
              name="operation"
              className="rounded-lg border border-[#e3eaf2] bg-white px-2.5 py-1.5 text-[11px] text-[#33465f] outline-none"
              defaultValue="close"
            >
              <option value="close">إغلاق</option>
              <option value="resolve">تعليم كمحلولة</option>
              <option value="assign_me">إسناد إليّ</option>
            </select>
            <button
              type="submit"
              disabled={pending || selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b1f46] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#1a3563] disabled:opacity-50"
            >
              {pending && <Loader2 size={13} className="animate-spin" />}
              تنفيذ على المحددة
            </button>
            {state.message && (
              <span className={`text-[11px] ${state.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{state.message}</span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState>لا تذاكر مطابقة للفلاتر الحالية</EmptyState>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="تحديد الكل"
                        checked={allSelected}
                        onChange={(event) =>
                          setSelected(event.target.checked ? new Set(filtered.map((t) => t.id)) : new Set())
                        }
                      />
                    </th>
                    <th>التذكرة</th>
                    <th>الفئة</th>
                    <th>الأولوية</th>
                    <th>الحالة</th>
                    <th>SLA</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ticket) => {
                    const sla = slaState(ticket, now)
                    const breached = sla?.breached ?? false
                    return (
                      <tr key={ticket.id} className={breached ? 'bg-rose-50/60' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            name="ids"
                            value={ticket.id}
                            checked={selected.has(ticket.id)}
                            onChange={() => toggle(ticket.id)}
                            aria-label={`تحديد ${ticket.ticketNumber}`}
                          />
                        </td>
                        <td>
                          <Link href={`/admin/support/${ticket.id}`} className="font-medium text-[#102444] hover:underline">
                            {ticket.subject}
                          </Link>
                          <div className="text-[10px] text-[#94a3b8]" dir="ltr">{ticket.ticketNumber}</div>
                        </td>
                        <td><GlassBadge tone="neutral">{categoryLabels[ticket.category]}</GlassBadge></td>
                        <td>
                          <GlassBadge tone={ticket.priority === 'critical' || ticket.priority === 'high' ? 'bad' : ticket.priority === 'medium' ? 'warn' : 'neutral'}>
                            {priorityLabels[ticket.priority]}
                          </GlassBadge>
                        </td>
                        <td>
                          <GlassBadge tone={ticketStatusTone[ticket.status]}>{ticketStatusLabels[ticket.status]}</GlassBadge>
                        </td>
                        <td>
                          {sla === null ? (
                            <span className="text-[10px] text-[#94a3b8]">—</span>
                          ) : breached ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600">
                              <AlertTriangle size={12} />
                              متأخر {sla.minutes} د
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#65768d]">خلال {sla.minutes} د</span>
                          )}
                        </td>
                        <td>
                          <Link href={`/admin/support/${ticket.id}`} className="admin-btn admin-btn-sm">
                            فتح
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassPanel>
      </form>

      <p className="admin-footnote">
        التذاكر تُدار من جدول <code className="admin-code">support_tickets</code> (ترحيل 05). الأولوية الحرجة ترفع تنبيهًا صوتيًا.
      </p>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  tone: string
}) {
  return (
    <GlassPanel className="p-4">
      <div className="flex items-center gap-2 text-[#65768d]">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </GlassPanel>
  )
}
