import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowRight,
  CarFront,
  FileBadge,
  FileText,
  Gauge,
  MapPin,
  Palette,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { requireRoles } from '@/lib/auth'
import { getCustomerRequests } from '@/lib/customer-data'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'
import { getInspectionReport } from '@/lib/inspection-report-store'
import { computeInspectionHealthScore, computeInspectionSectionHealth, inspectionSections } from '@/lib/inspection-report'
import type { Json } from '@/lib/supabase/database.types'
import PrintReportButton from '@/components/modules/reports/print-report-button'
import ExportReportPdfButton from '@/components/modules/reports/export-report-pdf-button'
import InspectionHealthVisualization from '@/components/modules/reports/inspection-health-visualization'
import ReportMediaGallery from '@/components/modules/reports/report-media-gallery'

export const metadata = { title: 'تقرير الفحص' }

function checklistRecord(value: Json): { [key: string]: Json | undefined } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function Info({ icon: Icon, label, value }: { icon: typeof CarFront; label: string; value: string }) {
  return (
    <div className="app-info-row">
      <dt><Icon size={15} /> {label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function resultTone(result: string): string {
  if (result === 'سليم') return 'is-good'
  if (result === 'ملاحظة') return 'is-note'
  if (result === 'متضرر') return 'is-damaged'
  if (result === 'غير معروف') return 'is-unknown'
  return 'is-history'
}

export default async function CustomerInspectionReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireRoles(['customer'])
  const { id } = await params
  const [orders, report] = await Promise.all([
    getCustomerRequests(session.sub),
    getInspectionReport({ inspectionId: id, requesterId: session.sub, role: 'customer' }),
  ])
  const inspection = orders.find((item) => item.id === id)
  if (!inspection || inspection.status !== 'completed' || !report) notFound()

  const checklist = checklistRecord(report.checklist)
  const checklistResults: Record<string, string> = {}
  for (const [key, value] of Object.entries(checklist)) {
    if (typeof value === 'string') checklistResults[key] = value
  }
  const health = computeInspectionHealthScore(checklistResults)
  const sectionHealth = computeInspectionSectionHealth(checklistResults)
  const totalItems = inspectionSections.reduce((sum, section) => sum + section.items.length, 0)
  const recordedItems = inspectionSections.reduce(
    (sum, section) => sum + section.items.filter((item) => typeof checklist[`${section.id}:${item.id}`] === 'string').length,
    0,
  )

  return (
    <div id="inspection-report-content" className="app-page app-printable-report">
      <section className="app-page-head">
        <div>
          <span className="app-eyebrow"><ShieldCheck size={14} /> تقرير خاص بطلبك</span>
          <h2>{inspection.vehicle.make} {inspection.vehicle.model} · {inspection.vehicle.year}</h2>
          <p>
            رقم الطلب {inspection.id} · {inspection.city}، {inspection.district} ·
            {' '}وقت الإرسال {report.submittedAt ? formatArabicDate(report.submittedAt) : '—'}
          </p>
        </div>
        <div className="app-report-actions" data-html2canvas-ignore="true">
          <ExportReportPdfButton inspectionId={inspection.id} />
          <PrintReportButton />
          <Link href="/dashboard/reports" className="btn btn-ghost"><ArrowRight size={16} /> كل التقارير</Link>
        </div>
      </section>

      <InspectionHealthVisualization health={health} sections={sectionHealth} />

      <section className="app-panel">
        <header className="app-panel-head">
          <span className="app-panel-icon"><CarFront size={20} /></span>
          <div>
            <h2>بيانات المركبة</h2>
            <p>المعلومات المسجلة في الطلب وقت الفحص.</p>
          </div>
          <span className="app-badge is-done"><ShieldCheck size={14} /> موثّق</span>
        </header>
        <dl className="app-info-list">
          <Info icon={CarFront} label="المركبة" value={`${inspection.vehicle.make} ${inspection.vehicle.model}`} />
          <Info icon={FileText} label="سنة الصنع" value={String(inspection.vehicle.year)} />
          <Info icon={Gauge} label="العداد" value={inspection.vehicle.mileage ? `${formatArabicNumber(inspection.vehicle.mileage)} كم` : 'غير مسجل'} />
          <Info icon={Palette} label="اللون" value={inspection.vehicle.color || 'غير مسجل'} />
          <Info icon={Wrench} label="نوع الفحص" value={inspection.services.join('، ') || 'فحص شامل'} />
          <Info icon={MapPin} label="موقع السيارة" value={`${inspection.city}، ${inspection.district}`} />
        </dl>
        <p className="app-panel-note">{inspection.address}</p>
      </section>

      <div className="app-columns">
        <section className="app-panel">
          <header className="app-panel-head">
            <span className="app-panel-icon"><FileText size={20} /></span>
            <div>
              <h2>نتائج بنود الفحص</h2>
              <p>سجّل الفاحص {formatArabicNumber(recordedItems)} من {formatArabicNumber(totalItems)} بندًا في المعاينة الظاهرية.</p>
            </div>
          </header>

          <div className="app-checklist">
            {inspectionSections.map((section) => (
              <article key={section.id} className="app-checklist-section">
                <h3>{section.title}</h3>
                <div className="app-checklist-items">
                  {section.items.map((item) => {
                    const value = checklist[`${section.id}:${item.id}`]
                    const result = typeof value === 'string' ? value : null
                    return (
                      <div key={item.id} className={`app-checklist-item ${result ? 'is-recorded' : ''}`}>
                        <span>{item.label}</span>
                        <strong className={result ? `app-result-badge ${resultTone(result)}` : 'app-result-badge is-empty'}>{result ?? 'غير مسجل'}</strong>
                      </div>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>

          {report.notes && (
            <div className="app-report-note">
              <h3>ملاحظات الفاحص</h3>
              <p>{report.notes}</p>
            </div>
          )}
        </section>

        <aside className="app-aside">
          <section className="app-panel">
            <span className="app-panel-icon"><FileBadge size={20} /></span>
            <h2>مرفقات الفحص</h2>
            <p className="app-panel-note">صور وفيديو وملفات PDF خاصة بروابط مؤقتة، لا تشاركها خارج حسابك.</p>
            <ReportMediaGallery media={report.media} />
          </section>

          <section className="app-panel is-soft">
            <span className="app-panel-icon"><ShieldCheck size={20} /></span>
            <h2>حدود التقرير</h2>
            <p>التقرير يعكس ملاحظات المعاينة المسجلة وقت الفحص، ولا يُعد ضمانًا لحالة المركبة أو بديلًا عن تقييم مركز صيانة متخصص.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
