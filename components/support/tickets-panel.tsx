'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, HelpCircle, LifeBuoy, Loader2, Paperclip, Plus, Search, X } from 'lucide-react'
import {
  categoryLabels,
  categoryOrder,
  priorityLabels,
  priorityOrder,
  ticketStatusLabels,
  ticketStatusTone,
} from '@/lib/support/labels'
import type { SupportTicket, TicketCategory, TicketPriority } from '@/lib/support/store'

/**
 * The requester's support panel: their ticket list, a creation dialog, and a
 * self-service FAQ that answers the common questions before a ticket is opened.
 *
 * Device and location context are captured at submit time (features 30 & 32):
 * a field bug that cannot be reproduced without the reporter's device is
 * guesswork, and the inspector will have closed the app long before anyone reads
 * the ticket.
 */

type Faq = { q: string; a: string }

const FAQS: Faq[] = [
  { q: 'كم يستغرق استرداد المبلغ؟', a: 'تُعاد المبالغ إلى وسيلة الدفع نفسها خلال ٥ إلى ٧ أيام عمل بعد اعتماد الطلب.' },
  { q: 'إحداثيات الموقع غير دقيقة', a: 'فعّل صلاحية الموقع «أثناء الاستخدام» لتطبيق فاحص من إعدادات الجهاز، ثم أعد فتح لوحة الميدان.' },
  { q: 'لماذا حسابي مقفل؟', a: 'يُقفل الحساب مؤقتًا بعد ٥ محاولات تحقق فاشلة، أو عند اشتباه أمني. افتح تذكرة فئة «قفل الحساب».' },
  { q: 'كيف أوثّق رقم جوالي؟', a: 'يُرسل رمز مكوّن من ٦ أرقام إلى جوالك عند تسجيل الدخول. أدخله في شاشة التوثيق لفتح حسابك.' },
  { q: 'التقرير لم يصلني', a: 'تظهر التقارير المكتملة في «تقاريري» مباشرة بعد إرسال الفاحص لها. تأكد من اكتمال الفحص أولًا.' },
]

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

  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<TicketCategory>('inspection_issue')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const filteredFaqs = useMemo(() => {
    const query = faqQuery.trim()
    if (!query) return FAQS
    return FAQS.filter((item) => `${item.q} ${item.a}`.includes(query))
  }, [faqQuery])

  const reset = useCallback(() => {
    setSubject('')
    setCategory('inspection_issue')
    setPriority('medium')
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
          priority,
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
  }, [category, description, file, priority, reset, router, subject])

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-[#eef4fb] text-[#0b5cad]">
            <LifeBuoy size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[#102444]">تذاكر الدعم الفني</h1>
            <p className="text-[11px] text-[#65768d]">تابع مشكلاتك وتواصل مع فريق الدعم مباشرة.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFaqOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e3eaf2] bg-white px-3 py-2 text-[11px] font-medium text-[#475d78] transition hover:bg-slate-50"
          >
            <HelpCircle size={14} />
            الأسئلة الشائعة
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b1f46] px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-[#1a3563]"
          >
            <Plus size={14} />
            تذكرة جديدة
          </button>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e3eaf2] bg-white px-5 py-14 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#eef4fb] text-[#0b5cad]">
            <LifeBuoy size={22} />
          </span>
          <h2 className="mt-3 text-sm font-medium text-[#102444]">لا توجد تذاكر بعد</h2>
          <p className="mt-1 text-[11px] text-[#65768d]">افتح تذكرة وسيتابعها فريق الدعم حتى الحل.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e3eaf2] bg-white">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/support/tickets/${ticket.id}`}
              className="flex items-center gap-3 border-b border-[#eef3f9] px-4 py-3.5 last:border-0 transition hover:bg-[#f8fbff]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#eef4fb] text-[11px] font-bold text-[#0b5cad]">
                {ticket.priority === 'critical' ? '!' : ticket.ticketNumber.slice(-2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="truncate text-[12px] text-[#102444]">{ticket.subject}</strong>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-[#65768d]">
                    {categoryLabels[ticket.category]}
                  </span>
                </span>
                <span className="mt-0.5 block text-[10px] text-[#94a3b8]" dir="ltr">
                  {ticket.ticketNumber}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${toneClass(ticketStatusTone[ticket.status])}`}>
                {ticketStatusLabels[ticket.status]}
              </span>
              <ArrowLeft size={15} className="shrink-0 text-[#9aa7b8]" />
            </Link>
          ))}
        </div>
      )}

      {/* ── Create dialog ─────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-white/70 bg-white/95 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#102444]">تذكرة دعم جديدة</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="text-[#9aa7b8] hover:text-[#102444]">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[#475d78]">عنوان المشكلة</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="مثال: لم يصل تقرير الفحص"
                  className="rounded-lg border border-[#e3eaf2] px-3 py-2 text-[12px] text-[#102444] outline-none focus:border-[#93c5fd] focus:ring-2 focus:ring-[#dbeafe]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#475d78]">الفئة</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as TicketCategory)}
                    className="rounded-lg border border-[#e3eaf2] bg-white px-3 py-2 text-[12px] text-[#102444] outline-none focus:border-[#93c5fd]"
                  >
                    {categoryOrder.map((value) => (
                      <option key={value} value={value}>{categoryLabels[value]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-[#475d78]">الأولوية</span>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TicketPriority)}
                    className="rounded-lg border border-[#e3eaf2] bg-white px-3 py-2 text-[12px] text-[#102444] outline-none focus:border-[#93c5fd]"
                  >
                    {priorityOrder.map((value) => (
                      <option key={value} value={value}>{priorityLabels[value]}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-[#475d78]">وصف المشكلة</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  placeholder="اشرح ما حدث بالتفصيل…"
                  className="resize-y rounded-lg border border-[#e3eaf2] px-3 py-2 text-[12px] leading-6 text-[#102444] outline-none focus:border-[#93c5fd] focus:ring-2 focus:ring-[#dbeafe]"
                />
              </label>

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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#e3eaf2] px-3 py-2 text-[11px] text-[#475d78] transition hover:bg-slate-50"
                >
                  <Paperclip size={14} />
                  {file ? file.name : 'إرفاق صورة أو ملف'}
                </button>
                {file && (
                  <button type="button" onClick={() => setFile(null)} className="text-[11px] text-rose-600">
                    إزالة
                  </button>
                )}
              </div>

              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</p>}

              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-[11px] text-[#65768d] hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0b1f46] px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-[#1a3563] disabled:opacity-50"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {submitting ? 'جارٍ الإرسال…' : 'إرسال التذكرة'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FAQ drawer ────────────────────────────────────────────────────── */}
      {faqOpen && (
        <div className="fixed inset-0 z-[80] flex justify-start bg-slate-950/50 backdrop-blur-sm" onClick={() => setFaqOpen(false)}>
          <div
            className="h-full w-full max-w-sm overflow-y-auto bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#102444]">الأسئلة الشائعة</h2>
              <button type="button" onClick={() => setFaqOpen(false)} aria-label="إغلاق" className="text-[#9aa7b8] hover:text-[#102444]">
                <X size={18} />
              </button>
            </div>
            <div className="relative mt-4">
              <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa7b8]" />
              <input
                value={faqQuery}
                onChange={(event) => setFaqQuery(event.target.value)}
                placeholder="ابحث عن حل سريع…"
                className="w-full rounded-lg border border-[#e3eaf2] py-2 pr-9 pl-3 text-[12px] outline-none focus:border-[#93c5fd]"
              />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {filteredFaqs.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-[#94a3b8]">لا نتائج مطابقة. افتح تذكرة وسنساعدك.</p>
              ) : (
                filteredFaqs.map((item) => (
                  <details key={item.q} className="rounded-lg border border-[#e3eaf2] px-3 py-2.5">
                    <summary className="cursor-pointer text-[12px] font-medium text-[#102444]">{item.q}</summary>
                    <p className="mt-2 text-[11px] leading-6 text-[#65768d]">{item.a}</p>
                  </details>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function toneClass(tone: string) {
  if (tone === 'good') return 'bg-emerald-50 text-emerald-700'
  if (tone === 'warn') return 'bg-amber-50 text-amber-700'
  if (tone === 'bad') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}
