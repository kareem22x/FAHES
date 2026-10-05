'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Loader2, Paperclip, Send, Star } from 'lucide-react'
import { categoryLabels, priorityLabels, statusTimeline, ticketStatusLabels, ticketStatusTone } from '@/lib/support/labels'
import type { SupportEvent, SupportMessage, SupportTicket } from '@/lib/support/store'

/**
 * The live ticket thread.
 *
 * ── On "real-time" ───────────────────────────────────────────────────────────
 *
 * Migration 05 forces RLS and revokes anon/authenticated on the ticket tables, so
 * a browser-side Supabase Realtime subscription has nothing to read. Rather than
 * weaken the schema to enable it, the thread polls its own authenticated endpoint
 * every few seconds. The effect for the user is the same — replies appear without
 * a manual refresh — and the deny-by-default model stays intact.
 */

const POLL_INTERVAL_MS = 8_000

function formatTime(ms: number) {
  return new Date(ms).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })
}

function toneClass(tone: string) {
  if (tone === 'good') return 'bg-emerald-50 text-emerald-700'
  if (tone === 'warn') return 'bg-amber-50 text-amber-700'
  if (tone === 'bad') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}

export default function TicketThread({
  ticket: initialTicket,
  initialMessages,
}: {
  ticket: SupportTicket
  initialMessages: SupportMessage[]
}) {
  const [ticket, setTicket] = useState(initialTicket)
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [rating, setRating] = useState(0)
  const [rated, setRated] = useState(initialTicket.satisfactionRating !== null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/support/tickets/${initialTicket.id}`, { cache: 'no-store' })
      if (!response.ok) return
      const payload = (await response.json()) as {
        ticket?: SupportTicket
        messages?: SupportMessage[]
      }
      if (payload.ticket) setTicket(payload.ticket)
      if (payload.messages) setMessages(payload.messages)
    } catch {
      // Offline — keep the current view.
    }
  }, [initialTicket.id])

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  const uploadAttachment = useCallback(async (): Promise<{
    path: string
    name: string
    mime: string
    size: number
  } | null> => {
    if (!file) return null
    try {
      const signResponse = await fetch('/api/support/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
      })
      const signed = (await signResponse.json().catch(() => ({}))) as { signedUrl?: string; path?: string }
      if (!signResponse.ok || !signed.signedUrl || !signed.path) return null
      await fetch(signed.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      return { path: signed.path, name: file.name, mime: file.type, size: file.size }
    } catch {
      return null
    }
  }, [file])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text && !file) return
    setSending(true)
    setNotice('')

    const attachment = await uploadAttachment()

    try {
      const response = await fetch(`/api/support/tickets/${ticket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: text,
          attachmentPath: attachment?.path ?? null,
          attachmentName: attachment?.name ?? null,
          attachmentMime: attachment?.mime ?? null,
          attachmentSize: attachment?.size ?? null,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; reopened?: boolean }
      if (!response.ok || !payload.ok) {
        setNotice(payload.error ?? 'تعذر إرسال الرسالة.')
        setSending(false)
        return
      }
      setDraft('')
      setFile(null)
      if (payload.reopened) setNotice('أُعيد فتح التذكرة بسبب ردّك الجديد.')
      await refresh()
    } catch {
      setNotice('تعذر الاتصال بالخادم.')
    }
    setSending(false)
  }, [draft, file, refresh, ticket.id, uploadAttachment])

  const submitRating = useCallback(
    async (value: number) => {
      setRating(value)
      try {
        const response = await fetch(`/api/support/tickets/${ticket.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: value, note: '' }),
        })
        if (response.ok) {
          setRated(true)
          setNotice('شكرًا لتقييمك!')
        }
      } catch {
        setNotice('تعذر حفظ التقييم.')
      }
    },
    [ticket.id],
  )

  const showCsat = (ticket.status === 'resolved' || ticket.status === 'closed') && !rated

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/support/tickets" className="inline-flex items-center gap-1.5 text-[11px] text-[#0b5cad] hover:underline">
          <ArrowRight size={14} />
          كل التذاكر
        </Link>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${toneClass(ticketStatusTone[ticket.status])}`}>
          {ticketStatusLabels[ticket.status]}
        </span>
      </div>

      <div className="rounded-xl border border-[#e3eaf2] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-[#102444]">{ticket.subject}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-[#65768d]">{categoryLabels[ticket.category]}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass(ticketStatusTone[ticket.status])}`}>
            أولوية {priorityLabels[ticket.priority]}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-[#94a3b8]" dir="ltr">{ticket.ticketNumber}</p>

        {/* Status timeline (feature 13) */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {statusTimeline.map((status, index) => {
            const activeIndex = statusTimeline.indexOf(ticket.status)
            const done = index <= activeIndex
            return (
              <span key={status} className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-1 text-[10px] ${done ? toneClass(ticketStatusTone[status]) : 'bg-slate-50 text-[#b6c0cd]'}`}>
                  {ticketStatusLabels[status]}
                </span>
                {index < statusTimeline.length - 1 && <span className={`h-px w-4 ${done ? 'bg-[#c7d6e8]' : 'bg-[#eef3f9]'}`} />}
              </span>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#e3eaf2] bg-white p-4">
        <div className="flex flex-col gap-3">
          {messages.length === 0 && <p className="py-6 text-center text-[11px] text-[#94a3b8]">لا توجد رسائل بعد.</p>}
          {messages.map((message) => {
            const mine = message.authorRole !== 'admin'
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12px] leading-6 ${
                    mine ? 'bg-[#eef4fb] text-[#102444]' : 'bg-[#0b1f46] text-white'
                  }`}
                >
                  <span className="mb-1 block text-[9px] opacity-70">
                    {mine ? 'أنت' : 'فريق الدعم'} · {formatTime(message.createdAt)}
                  </span>
                  {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
                  {message.attachmentPath && (
                    <AttachmentLink path={message.attachmentPath} name={message.attachmentName ?? 'مرفق'} />
                  )}
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>

        {showCsat && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            <p className="text-[12px] font-medium text-emerald-800">كيف كانت تجربتك مع الدعم؟</p>
            <div className="mt-2 flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => void submitRating(value)}
                  aria-label={`${value} من ٥`}
                  className="transition hover:scale-110"
                >
                  <Star size={22} className={value <= rating ? 'fill-amber-400 text-amber-400' : 'text-[#c7d6e8]'} />
                </button>
              ))}
            </div>
          </div>
        )}

        {rated && ticket.satisfactionRating !== null && (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
            <Check size={14} />
            تم تسجيل تقييمك ({ticket.satisfactionRating}/٥). شكرًا لك.
          </p>
        )}

        <div className="border-t border-[#eef3f9] pt-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="اكتب ردّك…"
            className="w-full resize-y rounded-lg border border-[#e3eaf2] px-3 py-2 text-[12px] leading-6 text-[#102444] outline-none focus:border-[#93c5fd] focus:ring-2 focus:ring-[#dbeafe]"
          />
          {notice && <p className="mt-1.5 text-[11px] text-[#0b5cad]">{notice}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e3eaf2] px-2.5 py-1.5 text-[11px] text-[#475d78] transition hover:bg-slate-50"
              >
                <Paperclip size={14} />
                {file ? file.name.slice(0, 18) : 'إرفاق'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || (!draft.trim() && !file)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b1f46] px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-[#1a3563] disabled:opacity-50"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              إرسال
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AttachmentLink({ path, name }: { path: string; name: string }) {
  const [loading, setLoading] = useState(false)

  const open = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/support/attachments?path=${encodeURIComponent(path)}`)
      const payload = (await response.json().catch(() => ({}))) as { url?: string }
      if (payload.url) window.open(payload.url, '_blank', 'noopener')
    } finally {
      setLoading(false)
    }
  }, [path])

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-1 text-[10px] underline-offset-2 hover:underline"
    >
      <Paperclip size={12} />
      {loading ? 'جارٍ الفتح…' : name}
    </button>
  )
}
