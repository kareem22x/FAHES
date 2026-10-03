import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, CarFront, Clock3, MapPin, Navigation } from 'lucide-react'
import { InspectorOfferForm } from '@/components/modules/inspector/offer-form'
import { InspectorWorkflow } from '@/components/modules/inspector/workflow'
import { requireRoles } from '@/lib/auth'
import { getInspectorInspection } from '@/lib/inspection-store'
import { getUserById } from '@/lib/user-store'

export default async function InspectorInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireRoles(['inspector'])
  const user = await getUserById(session.sub)
  const { id } = await params
  const inspection = await getInspectorInspection(
    id,
    session.sub,
    user?.inspectorProfile?.cities ?? [],
  )
  if (!inspection) notFound()

  const isAssigned = inspection.assignedInspectorId === session.sub
  const dateFormat = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'full', timeStyle: 'short' })
  const currency = new Intl.NumberFormat('ar-SA')
  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${inspection.city} ${inspection.district} ${inspection.address}`)}`

  return (
    <main dir="rtl" className="inspector-dashboard inspector-inspection-page">
      <div className="inspector-detail-shell">
        <header className="inspector-detail-header">
          <Link href="/inspector/dashboard" className="inspector-back-link"><ArrowRight size={17} />العودة للوحة العمل</Link>
          <span className={`inspector-status-pill ${isAssigned ? 'is-online' : ''}`}><span />{isAssigned ? 'موعد مؤكد' : 'بانتظار الفاحص'}</span>
        </header>

        <div className="inspector-detail-content">
          <section className="inspector-detail-title">
            <div>
              <span className="inspector-section-kicker"><CarFront size={15} /> طلب فحص مركبة</span>
              <h1>تفاصيل طلب الفحص</h1>
              <p>رقم الطلب {inspection.id} · {inspection.city}</p>
            </div>
          </section>

          <div className="inspector-detail-grid">
            <div className="inspector-detail-main">
              <section className="inspector-detail-card inspector-detail-vehicle">
                <span className="inspector-detail-car-mark"><CarFront size={25} /></span>
                <div>
                  <small>بيانات المركبة</small>
                  <h2>{inspection.vehicle.make} {inspection.vehicle.model} {inspection.vehicle.year}</h2>
                  <div className="inspector-detail-tags">
                    {inspection.vehicle.color && <span>اللون: {inspection.vehicle.color}</span>}
                    {inspection.vehicle.mileage !== null && <span>الممشى: {new Intl.NumberFormat('ar-SA').format(inspection.vehicle.mileage)} كم</span>}
                  </div>
                </div>
              </section>

              <section className="inspector-detail-card">
                <div className="inspector-detail-card-heading"><div><span className="inspector-section-kicker"><MapPin size={14} /> موقع السيارة</span><h2>معلومات الزيارة</h2></div></div>
                <div className="inspector-map-placeholder">
                  <MapPin size={22} />
                  <span className="inspector-map-caption">العنوان المسجل للزيارة</span>
                  <a href={mapSearchUrl} target="_blank" rel="noreferrer">البحث عن العنوان في خرائط Google</a>
                </div>
                <div className="inspector-location-details">
                  <div><MapPin size={17} /><span><small>العنوان</small><strong>{inspection.city}، {inspection.district}</strong><span>{inspection.address}</span></span></div>
                  <div><Clock3 size={17} /><span><small>موعد الفحص المطلوب</small><strong>{dateFormat.format(new Date(inspection.scheduledAt))}</strong></span></div>
                </div>
              </section>

              {inspection.notes && <section className="inspector-detail-card"><h2>ملاحظات العميل</h2><p className="inspector-detail-notes">{inspection.notes}</p></section>}

              {isAssigned ? (
                <InspectorWorkflow
                  inspection={{
                    id: inspection.id,
                    status: inspection.status,
                    vehicleName: `${inspection.vehicle.make} ${inspection.vehicle.model} ${inspection.vehicle.year}`,
                    services: inspection.services,
                    acceptedPrice: inspection.myOffer?.price ?? null,
                    address: `${inspection.city}، ${inspection.district}، ${inspection.address}`,
                  }}
                />
              ) : (
                <section className="inspector-detail-card inspector-offer-panel">
                  <div><span className="inspector-section-kicker"><Navigation size={14} /> تقديم عرض</span><h2>حدّد سعرك للعميل</h2><p>راجع نوع الفحص والموقع والموعد قبل إرسال عرضك.</p></div>
                  {inspection.myOffer ? (
                    <div className="inspector-offer-submitted">عرضك الحالي <strong>{currency.format(inspection.myOffer.price)} ر.س</strong> · بانتظار رد العميل</div>
                  ) : user?.inspectorProfile?.isOnline ? (
                    <InspectorOfferForm inspectionId={inspection.id} />
                  ) : (
                    <p className="inspector-offline-hint">فعّل حالة التوفر من لوحة العمل لتقديم عرض.</p>
                  )}
                </section>
              )}
            </div>

            <aside className="inspector-detail-sidebar">
              <section className="inspector-detail-card">
                <span className="inspector-side-card-icon"><Navigation size={19} /></span>
                <h2>ملخص الفحص</h2>
                <div className="inspector-detail-summary-row"><span>حالة الطلب</span><strong>{isAssigned ? 'مسند إليك' : 'مفتوح للعروض'}</strong></div>
                <div className="inspector-detail-summary-row"><span>نوع الفحص</span><strong>{inspection.services.join('، ')}</strong></div>
                {inspection.myOffer && <div className="inspector-detail-summary-row"><span>{isAssigned ? 'السعر المقبول' : 'عرضك'}</span><strong>{currency.format(inspection.myOffer.price)} ر.س</strong></div>}
                <div className="inspector-detail-privacy">اسم العميل ورقم جواله غير معروضين. تواصل العميل متاح بعد استكمال إعدادات المنصة.</div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </main>
  )
}
