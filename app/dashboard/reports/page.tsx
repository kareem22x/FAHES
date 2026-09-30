import Link from 'next/link'
import { ArrowLeft, CarFront, Clock3, FileText, ImageIcon, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
import { requireRoles } from '@/lib/auth'
import { getCustomerRequests, getSubmittedReportIds } from '@/lib/customer-data'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'

export default async function CustomerReportsPage() {
  const session = await requireRoles(['customer'])
  const [requests, submittedIds] = await Promise.all([
    getCustomerRequests(session.sub),
    getSubmittedReportIds(session.sub),
  ])

  const submitted = new Set(submittedIds)
  const completed = requests.filter((request) => request.status === 'completed')
  const ready = completed.filter((request) => submitted.has(request.id))
  const pending = completed.filter((request) => !submitted.has(request.id))

  return (
    <div className="app-page">
      <section className="app-page-head">
        <div>
          <span className="app-eyebrow"><FileText size={14} /> أرشيف الفحوص</span>
          <h2>تقارير الفحص</h2>
          <p>كل تقارير سياراتك في مكان واحد، مع الصور وملاحظات الفاحص وتفاصيل بنود الفحص.</p>
        </div>
        <span className="app-counter"><ShieldCheck size={15} /> {formatArabicNumber(ready.length)} تقرير جاهز</span>
      </section>

      {ready.length === 0 && pending.length === 0 ? (
        <div className="app-empty is-panel">
          <span><FileText size={22} /></span>
          <strong>لا توجد تقارير بعد</strong>
          <p>يظهر تقرير الفحص هنا مباشرة بعد أن يُكمل الفاحص الزيارة ويرفع نتائجه إلى النظام.</p>
          <Link href="/dashboard/requests" className="btn btn-ghost btn-sm">متابعة طلباتي <ArrowLeft size={16} /></Link>
        </div>
      ) : (
        <>
          {ready.length > 0 && (
            <section className="app-reports stagger-on-view">
              {ready.map((request) => (
                <article key={request.id} className="app-report-card">
                  <span className="app-report-icon"><FileText size={20} /></span>
                  <div className="app-report-text">
                    <small>{request.id}</small>
                    <h3>{request.vehicle.make} {request.vehicle.model} <span>· {request.vehicle.year}</span></h3>
                    <p><MapPin size={13} /> {request.city}، {request.district}</p>
                    <p><ImageIcon size={13} /> تقرير بالصور وملاحظات الفاحص</p>
                  </div>
                  <Link href={`/dashboard/inspections/${encodeURIComponent(request.id)}`} className="btn btn-primary btn-sm">
                    عرض التقرير <ArrowLeft size={15} />
                  </Link>
                </article>
              ))}
            </section>
          )}

          {pending.length > 0 && (
            <section className="app-panel">
              <header className="app-panel-head">
                <div>
                  <h2>في انتظار رفع التقرير</h2>
                  <p>اكتمل الفحص الميداني، ويجري الآن تجهيز التقرير النهائي.</p>
                </div>
              </header>
              <div className="app-pending-list">
                {pending.map((request) => (
                  <div key={request.id} className="app-pending-row">
                    <span><CarFront size={18} /></span>
                    <div>
                      <strong>{request.vehicle.make} {request.vehicle.model} · {request.vehicle.year}</strong>
                      <small><MapPin size={12} /> {request.city}، {request.district}</small>
                    </div>
                    <span className="app-pending-state"><Clock3 size={13} /> قيد التجهيز</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="app-panel is-soft">
        <span className="app-panel-icon"><Sparkles size={20} /></span>
        <h2>ملاحظة عن التقارير</h2>
        <p>التقرير يعكس ملاحظات المعاينة الظاهرية المسجلة وقت الفحص، ولا يُعد ضمانًا لحالة المركبة أو بديلًا عن تقييم ورشة متخصصة.</p>
      </section>
    </div>
  )
}
