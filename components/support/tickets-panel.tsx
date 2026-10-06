'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  CircleCheck,
  Clock3,
  HelpCircle,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Tag,
  X,
} from 'lucide-react'
import {
  categoryLabels,
  categoryOrder,
  statusOrder,
  ticketStatusClass,
  ticketStatusLabels,
} from '@/lib/support/labels'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'
import type { SupportTicket, TicketCategory, TicketStatus } from '@/lib/support/store'

/**
 * The requester's support panel: their ticket list, a creation dialog, and a
 * self-service FAQ that answers the common questions before a ticket is opened.
 *
 * Device and location context are captured at submit time (features 30 & 32):
 * a field bug that cannot be reproduced without the reporter's device is
 * guesswork, and the inspector will have closed the app long before anyone reads
 * the ticket.
 *
 * ── On the markup ──────────────────────────────────────────────────────────
 *
 * The list is composed from the customer dashboard's own classes (`.app-request`,
 * `.app-request-meta`, `.app-status`, `.app-tabs`, `.app-kpis`, `.app-empty`)
 * rather than from bespoke styles. That is the point: the ticket screen used to
 * be built on hand-written hex values, which left it the one surface that
 * ignored the token ramp and did not respond to the dark theme. Reusing the
 * dashboard's classes means the two cannot drift apart again.
 */

type Faq = { q: string; a: string }

const FAQS: Faq[] = [
  { q: 'كم يستغرق استرداد المبلغ؟', a: 'تُعاد المبالغ إلى وسيلة الدفع نفسها خلال ٥ إلى ٧ أيام عمل بعد اعتماد الطلب.' },
  { q: 'إحداثيات الموقع غير دقيقة', a: 'فعّل صلاحية الموقع «أثناء الاستخدام» لتطبيق فاحص من إعدادات الجهاز، ثم أعد فتح لوحة الميدان.' },
  { q: 'لماذا حسابي مقفل؟', a: 'يُقفل الحساب مؤقتًا بعد ٥ محاولات تحقق فاشلة، أو عند اشتباه أمني. افتح تذكرة فئة «قفل الحساب».' },
  { q: 'كيف أوثّق رقم جوالي؟', a: 'يُرسل رمز مكوّن من ٦ أرقام إلى جوالك عند تسجيل الدخول. أدخله في شاشة التوثيق لفتح حسابك.' },
  { q: 'التقرير لم يصلني', a: 'تظهر التقارير المكتملة في «تقاريري» مباشرة بعد إرسال الفاحص لها. تأكد من اكتمال الفحص أولًا.' },
]

type FilterKey = 'all' | TicketStatus

function collectDeviceInfo() {
  if (typeof navigator === 'undefined') return {}
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? 'web',
  }
}

async function collectPosition(): Promise<{ latitude: number; longitude: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 4000)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timer)
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => {
        window.clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 60_000 },
    )
  })
}

export default function TicketsPanel({ tickets }: { tickets: SupportTicket[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState(false)
  const [faqQuery, setFaqQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<TicketCategory>('inspection_issue')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const filteredFaqs = useMemo(() => {
    const query = faqQuery.trim()
    if (!query) return FAQS
    return FAQS.filter((item) => `${item.q} ${item.a}`.includes(query))
  }, [faqQuery])

  const counts = useMemo(() => {
    const by = (status: TicketStatus) => tickets.filter((ticket) => ticket.status === status).length
    return {
      all: tickets.length,
      open: by('open'),
      in_progress: by('in_progress'),
      waiting_for_user: by('waiting_for_user'),
      resolved: by('resolved'),
      closed: by('closed'),
    } satisfies Record<FilterKey, number>
  }, [tickets])

  const visible = useMemo(
    () => (filter === 'all' ? tickets : tickets.filter((ticket) => ticket.status === filter)),
    [filter, tickets],
  )

  const activeCount = counts.open + counts.in_progress
  const closedCount = counts.resolved + counts.closed

  const reset = useCallback(() => {
    setSubject('')
    setCategory('inspection_issue')
    setDescription('')
    setFile(null)
    setError('')
  }, [])

  const submit = useCallback(async () => {
    if (subject.trim().length < 3 || description.trim().length < 1) {
      setError('أدخل عنوانًا لا يقل عن ٣ أحرف ووصفًا للمشكلة.')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const position = await collectPosition()
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          category,
          body: description,
          deviceInfo: collectDeviceInfo(),
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        ticket?: SupportTicket
      }
      if (!response.ok || !payload.ok || !payload.ticket) {
        setError(payload.error ?? 'تعذر إنشاء التذكرة. حاول مجددًا.')
        setSubmitting(false)
        return
      }

      const ticketId = payload.ticket.id

      // The attachment is best-effort: a failed upload must not lose the ticket
      // that was already created.
      if (file) {
        try {
          const signResponse = await fetch('/api/support/attachments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
          })
          const signed = (await signResponse.json().catch(() => ({}))) as {
            signedUrl?: string
            path?: string
          }
          if (signResponse.ok && signed.signedUrl && signed.path) {
            await fetch(signed.signedUrl, {
              method: 'PUT',
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
              body: file,
            })
            await fetch(`/api/support/tickets/${ticketId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                body: 'مرفق من مقدّم التذكرة.',
                attachmentPath: signed.path,
                attachmentName: file.name,
                attachmentMime: file.type,
                attachmentSize: file.size,
              }),
            })
          }
        } catch {
          // Ignore — the ticket exists and the user can re-attach in the thread.
        }
      }

      setSubmitting(false)
      setOpen(false)
      reset()
      router.push(`/support/tickets/${ticketId}`)
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مجددًا.')
      setSubmitting(false)
    }
  }, [category, description, file, reset, router, subject])

  return (
    <div className="app-page">
      <section className="app-page-head">
        <div>
          <span className="app-eyebrow"><LifeBuoy size={14} /> مركز الدعم</span>
          <h2>تذاكر الدعم الفني</h2>
          <p>ارفع مشكلتك، أرفق صورة إن احتجت، وتابع ردّ فريق الدعم معك حتى الحل.</p>
        </div>
        <div className="app-page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setFaqOpen(true)}>
            <HelpCircle size={16} /> الأسئلة الشائعة
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={17} /> تذكرة جديدة
          </button>
        </div>
      </section>

      <section className="app-kpis stagger-on-view" aria-label="ملخص تذاكرك">
        <article className="app-kpi">
          <span className="app-kpi-icon"><LifeBuoy size={19} /></span>
          <strong>{formatArabicNumber(counts.all)}</strong>
          <p>إجمالي التذاكر</p>
          <small>كل ما فتحته حتى الآن</small>
        </article>
        <article className="app-kpi">
          <span className="app-kpi-icon"><Clock3 size={19} /></span>
          <strong>{formatArabicNumber(activeCount)}</strong>
          <p>قيد المتابعة</p>
          <small>لم تُحل بعد</small>
        </article>
        <article className={`app-kpi ${counts.waiting_for_user > 0 ? 'is-brand' : ''}`}>
          <span className="app-kpi-icon"><MessageSquare size={19} /></span>
          <strong>{formatArabicNumber(counts.waiting_for_user)}</strong>
          <p>بانتظار ردّك</p>
          <small>{counts.waiting_for_user > 0 ? 'يحتاج فريق الدعم جوابًا منك' : 'لا شيء معلّق عليك'}</small>
        </article>
        <article className="app-kpi">
          <span className="app-kpi-icon"><CircleCheck size={19} /></span>
          <strong>{formatArabicNumber(closedCount)}</strong>
          <p>تم حلها</p>
          <small>مغلقة أو محلولة</small>
        </article>
      </section>

      <nav className="app-tabs" aria-label="تصفية التذاكر حسب الحالة">
        {(['all', ...statusOrder] as FilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={key === filter ? 'is-current' : undefined}
            aria-current={key === filter ? 'true' : undefined}
            onClick={() => setFilter(key)}
          >
            {key === 'all' ? 'الكل' : ticketStatusLabels[key]}
            <span>{formatArabicNumber(counts[key])}</span>
          </button>
        ))}
      </nav>

      {visible.length === 0 ? (
        <div className="app-empty is-panel">
          <span><LifeBuoy size={22} /></span>
          <strong>{filter === 'all' ? 'ما فتحت أي تذكرة بعد' : 'لا توجد تذاكر في هذه الحالة'}</strong>
          <p>
            {filter === 'all'
              ? 'افتح تذكرة واشرح مشكلتك، وسيتابعها فريق الدعم معك حتى الحل — ويمكنك إرفاق صورة أو ملف.'
              : 'اختر حالة أخرى لرؤية بقية تذاكرك.'}
          </p>
          {filter === 'all' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
              <Plus size={16} /> تذكرة جديدة
            </button>
          )}
        </div>
      ) : (
        <div className="app-request-list stagger-on-view">
          {visible.map((ticket) => (
            <Link key={ticket.id} href={`/support/tickets/${ticket.id}`} className="app-request">
              <div className="app-request-top">
                <div className="app-vehicle">
                  <span className="app-vehicle-icon"><MessageSquare size={21} /></span>
                  <div className="app-vehicle-text">
                    <small>{ticket.ticketNumber}</small>
                    <h3>{ticket.subject}</h3>
                    <p><Tag size={14} />{categoryLabels[ticket.category]}</p>
                  </div>
                </div>
                <span className={`app-status ${ticketStatusClass[ticket.status]}`}>
                  {ticketStatusLabels[ticket.status]}
                </span>
              </div>

              <dl className="app-request-meta is-pair">
                <div><dt><Clock3 size={14} /> آخر تحديث</dt><dd>{formatArabicDate(ticket.updatedAt)}</dd></div>
                <div><dt><BadgeCheck size={14} /> تاريخ الفتح</dt><dd>{formatArabicDate(ticket.createdAt)}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}

      {/* ── Create dialog ─────────────────────────────────────────────────── */}
      {open && (
        <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-label="تذكرة دعم جديدة" onClick={() => setOpen(false)}>
          <div className="app-modal" onClick={(event) => event.stopPropagation()}>
            <header className="app-modal-head">
              <span className="app-panel-icon"><Plus size={20} /></span>
              <div>
                <h2>تذكرة دعم جديدة</h2>
                <p>اشرح المشكلة بوضوح — كل تفصيل يقرّب الحل.</p>
              </div>
              <button type="button" className="app-modal-close" onClick={() => setOpen(false)} aria-label="إغلاق">
                <X size={18} />
              </button>
            </header>

            <div className="app-modal-body">
              <label className="app-field">
                <span>عنوان المشكلة</span>
                <input
                  className="app-input"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="مثال: لم يصل تقرير الفحص"
                />
              </label>

              {/* The requester does not choose a priority: urgency is a triage
                  decision the support team makes after reading the ticket. A
                  customer picking "حرجة" for a cosmetic issue only skews the
                  first-response SLA that the console paints red. */}
              <label className="app-field">
                <span>الفئة</span>
                <select className="app-select" value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)}>
                  {categoryOrder.map((value) => (
                    <option key={value} value={value}>{categoryLabels[value]}</option>
                  ))}
                </select>
              </label>

              <label className="app-field">
                <span>وصف المشكلة</span>
                <textarea
                  className="app-textarea"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="اشرح ما حدث بالتفصيل…"
                />
              </label>

              <div className="app-field">
                <span>مرفق (اختياري)</span>
                <div className="app-field-actions">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}>
                    <Paperclip size={15} /> {file ? file.name : 'إرفاق صورة أو ملف'}
                  </button>
                  {file && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
                      <X size={15} /> إزالة
                    </button>
                  )}
                </div>
                <p className="app-field-note">يُرفق تلقائيًا نوع جهازك وموقعك التقريبي وقت الإرسال لتسريع التشخيص.</p>
              </div>

              {error && <p className="app-field-error">{error}</p>}
            </div>

            <footer className="app-modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>إلغاء</button>
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={submitting}>
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {submitting ? 'جارٍ الإرسال…' : 'إرسال التذكرة'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ── FAQ drawer ────────────────────────────────────────────────────── */}
      {faqOpen && (
        <div className="app-drawer-overlay" role="dialog" aria-modal="true" aria-label="الأسئلة الشائعة" onClick={() => setFaqOpen(false)}>
          <aside className="app-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="app-drawer-head">
              <span className="app-panel-icon"><HelpCircle size={20} /></span>
              <div>
                <h2>الأسئلة الشائعة</h2>
                <p>أغلب المشكلات لها جواب جاهز هنا.</p>
              </div>
              <button type="button" className="app-modal-close" onClick={() => setFaqOpen(false)} aria-label="إغلاق">
                <X size={18} />
              </button>
            </div>

            <div className="app-search">
              <Search size={15} />
              <input
                className="app-input"
                value={faqQuery}
                onChange={(event) => setFaqQuery(event.target.value)}
                placeholder="ابحث عن حل سريع…"
              />
            </div>

            <div className="app-faq">
              {filteredFaqs.length === 0 ? (
                <p className="app-faq-empty">لا نتائج مطابقة. افتح تذكرة وسنساعدك.</p>
              ) : (
                filteredFaqs.map((item) => (
                  <details key={item.q}>
                    <summary>{item.q}<ChevronDown size={17} /></summary>
                    <p>{item.a}</p>
                  </details>
                ))
              )}
            </div>

            <button type="button" className="btn btn-primary" onClick={() => { setFaqOpen(false); setOpen(true) }}>
              <Plus size={17} /> لم أجد جوابي — افتح تذكرة
            </button>
          </aside>
        </div>
      )}
    </div>
  )
}
