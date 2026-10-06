'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleCheck, Loader2, MessageSquare, Paperclip, Send, Sparkles, Star } from 'lucide-react'
import {
  categoryLabels,
  statusTimeline,
  ticketStatusClass,
  ticketStatusHint,
  ticketStatusLabels,
} from '@/lib/support/labels'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'
import type { SupportMessage, SupportTicket } from '@/lib/support/store'

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
 *
 * ── On the markup ────────────────────────────────────────────────────────────
 *
 * The status tracker is the dashboard's own `.app-progress` / `.app-flow`
 * component rather than the row of pills this screen used to draw, so a ticket's
 * progress reads the same way as an inspection's.
 */

const POLL_INTERVAL_MS = 8_000

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
  const step = statusTimeline.indexOf(ticket.status)

  return (
    <div className="app-page">
      <section className="app-page-head">
        <div>
          <span className="app-eyebrow"><MessageSquare size={14} /> {ticket.ticketNumber}</span>
          <h2>{ticket.subject}</h2>
          <p>
            {categoryLabels[ticket.category]} · فُتحت في {formatArabicDate(ticket.createdAt)}
          </p>
        </div>
        <div className="app-page-actions">
          <span className={`app-status ${ticketStatusClass[ticket.status]}`}>
            {ticketStatusLabels[ticket.status]}
          </span>
          <Link href="/support/tickets" className="btn btn-ghost btn-sm">
            <ArrowRight size={16} /> كل التذاكر
          </Link>
        </div>
      </section>

      <section className="app-progress" aria-label="مراحل التذكرة">
        <div className="app-flow" aria-hidden="true">
          {statusTimeline.map((status, index) => (
            <span
              key={status}
              className={`app-flow-dot ${index < step ? 'is-done' : ''} ${index === step ? 'is-current' : ''}`}
            />
          ))}
        </div>
        <p>
          <strong>{ticketStatusLabels[ticket.status]}</strong>
          <span>{ticketStatusHint[ticket.status]}</span>
        </p>
      </section>

      <section className="app-panel">
        <header className="app-panel-head">
          <span className="app-panel-icon"><MessageSquare size={20} /></span>
          <div>
            <h2>المحادثة</h2>
            <p>ردود فريق الدعم ورسائلك في مكان واحد.</p>
          </div>
        </header>

        <div className="app-chat">
          {messages.length === 0 && <p className="app-faq-empty">لا توجد رسائل بعد.</p>}
          {messages.map((message) => {
            const mine = message.authorRole !== 'admin'
            return (
              <div key={message.id} className={`app-chat-msg ${mine ? 'is-mine' : 'is-agent'}`}>
                <div className="app-chat-bubble">
                  <span className="app-chat-meta">
                    {mine ? 'أنت' : 'فريق الدعم'} · {formatArabicDate(message.createdAt)}
                  </span>
                  {message.body && <p>{message.body}</p>}
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
          <div className="app-csat">
            <strong>كيف كانت تجربتك مع الدعم؟</strong>
            <div className="app-csat-stars">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => void submitRating(value)}
                  aria-label={`${formatArabicNumber(value)} من ٥`}
                  className={`app-csat-star ${value <= rating ? 'is-on' : ''}`}
                >
                  <Star size={24} />
                </button>
              ))}
            </div>
          </div>
        )}

        {rated && ticket.satisfactionRating !== null && (
          <p className="app-csat-done">
            <CircleCheck size={15} />
            تم تسجيل تقييمك ({formatArabicNumber(ticket.satisfactionRating)}/٥). شكرًا لك.
          </p>
        )}

        <div className="app-composer">
          <textarea
            className="app-textarea"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="اكتب ردّك…"
          />
          {notice && <p className="app-note"><Sparkles size={14} />{notice}</p>}
          <div className="app-composer-foot">
            <div className="app-field-actions">
              <input
                ref={fileInput}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}>
                <Paperclip size={15} /> {file ? file.name.slice(0, 18) : 'إرفاق'}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void send()}
              disabled={sending || (!draft.trim() && !file)}
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              إرسال
            </button>
          </div>
        </div>
      </section>
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
    <button type="button" onClick={() => void open()} className="app-chat-attachment">
      <Paperclip size={13} />
      {loading ? 'جارٍ الفتح…' : name}
    </button>
  )
}
