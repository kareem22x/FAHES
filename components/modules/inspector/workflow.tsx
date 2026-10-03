'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { Check, CheckCircle2, ChevronDown, FileText, ImagePlus, MapPin, Play, Video } from 'lucide-react'
import { toast } from 'sonner'
import {
  inspectionPhotoCategories,
  inspectionResultOptions,
  inspectionSections,
  type InspectionResult,
} from '@/lib/inspection-report'
import { formatArabicNumber } from '@/lib/inspection-status'
import type { InspectionStatus } from '@/lib/inspection-store'
import type { InspectionReportMedia } from '@/types/inspection-report'

const workflowSteps = [
  { label: 'تم قبول الطلب', status: 'assigned' },
  { label: 'في الطريق', status: 'on_the_way' },
  { label: 'وصلت للموقع', status: 'arrived' },
  { label: 'بدأ الفحص', status: 'inspecting' },
  { label: 'اكتمل الفحص', status: 'completed' },
  { label: 'تم إرسال التقرير', status: 'completed' },
] as const

type ReportResponse = {
  checklist: Record<string, InspectionResult>
  notes: string
  submittedAt: string | null
  media: InspectionReportMedia[]
}

function PrivateInspectionImage({ url, category }: { url: string; category: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- Signed private-media URLs are short-lived.
  return <img src={url} alt={category} />
}

const nextStatus: Partial<Record<InspectionStatus, 'on_the_way' | 'arrived' | 'inspecting'>> = {
  assigned: 'on_the_way',
  on_the_way: 'arrived',
  arrived: 'inspecting',
}

const nextAction: Partial<Record<InspectionStatus, string>> = {
  assigned: 'أنا في الطريق',
  on_the_way: 'وصلت للموقع',
  arrived: 'بدء الفحص',
}

function statusStep(status: InspectionStatus) {
  if (status === 'completed') return workflowSteps.length - 1
  if (status === 'inspecting') return 3
  if (status === 'arrived') return 2
  if (status === 'on_the_way') return 1
  return 0
}

async function responseError(response: Response, fallback: string) {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error
    }
  } catch {
    return fallback
  }
  return fallback
}

export function InspectorWorkflow({
  inspection,
}: {
  inspection: {
    id: string
    status: InspectionStatus
    vehicleName: string
    services: string[]
    acceptedPrice: number | null
    address: string
  }
}) {
  const [status, setStatus] = useState(inspection.status)
  const [results, setResults] = useState<Record<string, InspectionResult>>({})
  const [notes, setNotes] = useState('')
  const [category, setCategory] = useState<string>(inspectionPhotoCategories[0])
  const [media, setMedia] = useState<InspectionReportMedia[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(inspectionSections[0].id)
  const [mediaGridRef] = useAutoAnimate<HTMLDivElement>({ duration: 220, easing: 'ease-out' })
  const completedItems = Object.keys(results).length
  const totalItems = inspectionSections.reduce((total, section) => total + section.items.length, 0)
  const progress = Math.round((completedItems / totalItems) * 100)
  const editable = status === 'inspecting'
  const step = statusStep(status)

  useEffect(() => {
    let active = true
    fetch(`/api/inspections/${encodeURIComponent(inspection.id)}/report`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, 'تعذر تحميل مسودة التقرير.'))
        return response.json() as Promise<ReportResponse>
      })
      .then((report) => {
        if (!active) return
        setResults(report.checklist)
        setNotes(report.notes)
        setMedia(report.media)
        setLoaded(true)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'تعذر تحميل مسودة التقرير.')
        setLoaded(true)
      })
    return () => { active = false }
  }, [inspection.id])

  const missingItems = useMemo(() => totalItems - completedItems, [completedItems, totalItems])

  async function advanceWorkflow() {
    const next = nextStatus[status]
    if (!next || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/inspections/${encodeURIComponent(inspection.id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!response.ok) throw new Error(await responseError(response, 'تعذر تحديث حالة الزيارة.'))
      setStatus(next)
      toast.success('تم حفظ حالة الزيارة.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة الزيارة.')
    } finally {
      setBusy(false)
    }
  }

  async function saveReport(submit: boolean) {
    if (!editable || busy || !loaded) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/inspections/${encodeURIComponent(inspection.id)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: results, notes, submit }),
      })
      if (!response.ok) throw new Error(await responseError(response, 'تعذر حفظ التقرير.'))
      if (submit) setStatus('completed')
      toast.success(submit ? 'تم حفظ التقرير وإتاحته للعميل.' : 'تم حفظ مسودة التقرير.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ التقرير.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || busy || status === 'completed' || status === 'cancelled') return
    setBusy(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.set('file', file)
        form.set('category', category)
        const response = await fetch(`/api/inspections/${encodeURIComponent(inspection.id)}/media`, {
          method: 'POST',
          body: form,
        })
        if (!response.ok) throw new Error(await responseError(response, `تعذر رفع الملف ${file.name}.`))
      }
      const response = await fetch(`/api/inspections/${encodeURIComponent(inspection.id)}/report`, { cache: 'no-store' })
      if (!response.ok) throw new Error(await responseError(response, 'تعذر تحديث قائمة الملفات.'))
      const report = await response.json() as ReportResponse
      setMedia(report.media)
      toast.success('تم رفع الملفات إلى التخزين الخاص للطلب.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر رفع الملف.')
    } finally {
      setBusy(false)
    }
  }

  async function removeMedia(mediaId: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/inspections/${encodeURIComponent(inspection.id)}/media/${encodeURIComponent(mediaId)}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await responseError(response, 'تعذر حذف الملف.'))
      setMedia((current) => current.filter((item) => item.id !== mediaId))
      toast.success('تم حذف الملف من الطلب.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حذف الملف.')
    } finally {
      setBusy(false)
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(inspection.address)
      setCopied(true)
      setCopyError(false)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopyError(true)
    }
  }

  return (
    <div className="inspector-workflow">
      {error && <p role="alert" className="inspector-preview-notice is-error">{error}</p>}
      <section className="inspector-detail-card inspector-progress-card">
        <div className="inspector-detail-card-heading">
          <div><span className="inspector-section-kicker"><Check size={14} /> تنفيذ الطلب</span><h2>سير الفحص</h2></div>
          <span className="inspector-local-state">تُحفظ الحالة على الطلب</span>
        </div>
        <div className="inspector-stepper" aria-label="تقدم عملية الفحص">
          {workflowSteps.map((item, index) => (
            <div key={`${item.status}-${index}`} className={`inspector-step ${index < step ? 'is-done' : ''} ${index === step ? 'is-active' : ''}`}>
              <span className="inspector-step-marker">{index < step ? <Check size={13} /> : index + 1}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        {nextStatus[status] && (
          <div className="inspector-workflow-actions">
            <button type="button" className="inspector-primary-link inspector-workflow-next" onClick={advanceWorkflow} disabled={busy}>
              {busy ? 'جارٍ الحفظ' : nextAction[status]} <Play size={14} />
            </button>
            <span>تُسجّل كل نقلة في سجل الطلب.</span>
          </div>
        )}
      </section>

      <section className="inspector-detail-card inspector-checklist-card">
        <div className="inspector-detail-card-heading">
          <div><span className="inspector-section-kicker"><Check size={14} /> قائمة الفحص</span><h2>فحص المركبة</h2></div>
          <span className="inspector-checklist-progress">{progress}% مكتمل</span>
        </div>
        <div className="inspector-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <p className="inspector-checklist-disclaimer">سجّل الملاحظات الظاهرة فقط؛ هذه القائمة لا تُعد تشخيصًا ميكانيكيًا نهائيًا.</p>
        {!loaded && <p role="status" className="inspector-local-state">جارٍ تحميل التقرير المحفوظ…</p>}
        <div className="inspector-checklist-sections">
          {inspectionSections.map((section) => (
            <details
              key={section.id}
              className="inspector-checklist-section"
              open={expandedSection === section.id}
              onToggle={(event) => {
                if (event.currentTarget.open) setExpandedSection(section.id)
                else if (expandedSection === section.id) setExpandedSection(null)
              }}
            >
              <summary><span>{section.title}</span><small>{section.items.filter((item) => results[`${section.id}:${item.id}`]).length}/{section.items.length}</small><ChevronDown size={17} /></summary>
              <div className="inspector-checklist-items">
                {section.items.map((item) => {
                  const itemKey = `${section.id}:${item.id}`
                  return (
                    <fieldset key={itemKey} className="inspector-checklist-item" disabled={!editable || busy || !loaded}>
                      <legend>{item.label}</legend>
                      <div className="inspector-result-options">
                        {inspectionResultOptions.map((option) => (
                          <label key={option} className={results[itemKey] === option ? 'is-selected' : ''}>
                            <input
                              type="radio"
                              name={itemKey}
                              value={option}
                              checked={results[itemKey] === option}
                              onChange={() => setResults((current) => ({ ...current, [itemKey]: option }))}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )
                })}
              </div>
            </details>
          ))}
        </div>
        <label className="inspector-notes-field">ملاحظات موظف الفحص<textarea rows={4} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!editable || busy || !loaded} placeholder="اكتب ملاحظات وصفية عن حالة المركبة الظاهرة" /></label>
        {editable && <div className="inspector-report-actions">
          <button type="button" className="inspector-secondary-link" onClick={() => saveReport(false)} disabled={busy || !loaded}>حفظ مسودة التقرير</button>
          <button type="button" className="inspector-primary-link" onClick={() => saveReport(true)} disabled={busy || !loaded || missingItems > 0}>
            إرسال التقرير للعميل · {missingItems > 0 ? `متبقي ${missingItems} بند` : 'جاهز'}
          </button>
        </div>}
      </section>

      <section className="inspector-detail-card inspector-media-card">
        <div className="inspector-detail-card-heading">
          <div><span className="inspector-section-kicker"><ImagePlus size={14} /> توثيق الفحص</span><h2>الصور والفيديو</h2></div>
          <span className="inspector-local-state">تخزين خاص بروابط مؤقتة</span>
        </div>
        <div className="inspector-upload-toolbar">
          <label>تصنيف الملف<select value={category} onChange={(event) => setCategory(event.target.value)} disabled={busy}>{inspectionPhotoCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="inspector-upload-button"><ImagePlus size={16} /> إضافة صور<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple disabled={busy || status === 'completed' || status === 'cancelled'} onChange={(event) => { void uploadFiles(event.target.files); event.target.value = '' }} /></label>
          <label className="inspector-video-picker"><Video size={16} /> إضافة فيديو<input type="file" accept="video/mp4,video/quicktime" disabled={busy || status === 'completed' || status === 'cancelled'} onChange={(event) => { void uploadFiles(event.target.files); event.target.value = '' }} /></label>
          <label className="inspector-video-picker"><FileText size={16} /> إضافة PDF<input type="file" accept="application/pdf,.pdf" multiple disabled={busy || status === 'completed' || status === 'cancelled'} onChange={(event) => { void uploadFiles(event.target.files); event.target.value = '' }} /></label>
        </div>
        <p className="inspector-checklist-disclaimer">الصور والفيديو وملفات PDF فقط، بحد أقصى 10 ميغابايت لكل ملف. لا ترفع مستندات شخصية أو معلومات دفع.</p>
        {media.length > 0 && <div className="inspector-photo-grid" ref={mediaGridRef}>
          {media.map((item) => (
            <figure key={item.id} className="inspector-photo-item">
              {item.type === 'image'
                ? <PrivateInspectionImage url={item.url} category={item.category} />
                : item.type === 'video'
                  ? <video src={item.url} controls preload="metadata" />
                  : <a className="inspector-document-preview" href={item.url} target="_blank" rel="noreferrer"><FileText size={30} /><span>{item.fileName || 'ملف PDF'}</span></a>}
              <figcaption><span>{item.category} · {item.fileName || item.type}</span><button type="button" onClick={() => removeMedia(item.id)} disabled={busy || status === 'completed'} aria-label={`حذف ${item.fileName || item.category}`}>حذف</button></figcaption>
            </figure>
          ))}
        </div>}
        {media.length === 0 && <p className="inspector-local-state">لا توجد ملفات مرفوعة لهذا الفحص.</p>}
      </section>

      <section className="inspector-detail-card inspector-report-preview">
        <div className="inspector-detail-card-heading"><div><span className="inspector-section-kicker"><Check size={14} /> التقرير</span><h2>ملخص التقرير</h2></div><span className="inspector-feature-status">{status === 'completed' ? 'مرسل للعميل' : editable ? 'مسودة قابلة للتعديل' : 'بانتظار بدء الفحص'}</span></div>
        <div className="inspector-report-summary">
          <div><small>المركبة</small><strong>{inspection.vehicleName}</strong></div>
          <div><small>الخدمات المطلوبة</small><strong>{inspection.services.join('، ')}</strong></div>
          <div><small>بنود تم تسجيلها</small><strong>{completedItems} من {totalItems}</strong></div>
          <div><small>الملفات المحفوظة</small><strong>{media.length}</strong></div>
          {inspection.acceptedPrice !== null && <div><small>قيمة العرض المقبول</small><strong>{formatArabicNumber(inspection.acceptedPrice)} ر.س</strong></div>}
        </div>
        {status === 'completed' && <p role="status" className="inspector-preview-notice"><CheckCircle2 size={14} />التقرير محفوظ ويمكن للعميل الاطلاع عليه من حسابه.</p>}
      </section>

      <div className="inspector-copy-address">
        <button type="button" className="inspector-copy-location" onClick={copyAddress}><MapPin size={15} />{copied ? 'تم نسخ العنوان' : 'نسخ عنوان السيارة'}</button>
        {copyError && <span role="alert">تعذر نسخ العنوان من المتصفح.</span>}
      </div>
    </div>
  )
}
