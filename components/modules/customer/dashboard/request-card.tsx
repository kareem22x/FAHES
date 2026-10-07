import Link from 'next/link'
import { AlertTriangle, CarFront, Check, Clock3, FileText, Gauge, MapPin, ShieldCheck, Sparkles, Wallet, Wrench } from 'lucide-react'
import { CustomerOfferActions } from '@/components/modules/customer/offer-actions'
import { formatArabicDate, formatArabicNumber, inspectionFlow, statusOf } from '@/lib/inspection-status'
import { paymentMethodLabel } from '@/lib/payments/payment-outcomes'
import type { StoredInspection } from '@/lib/inspection-store'

function Flow({ step }: { step: number }) {
  return (
    <div className="app-flow" aria-hidden="true">
      {inspectionFlow.map((item, index) => (
        <span
          key={item.status}
          className={`app-flow-dot ${index < step ? 'is-done' : ''} ${index === step ? 'is-current' : ''}`}
        />
      ))}
    </div>
  )
}

export default function RequestCard({
  request,
  showOffers = true,
  compact = false,
}: {
  request: StoredInspection
  showOffers?: boolean
  compact?: boolean
}) {
  const meta = statusOf(request.status)
  const isAssigned = request.status !== 'open' && request.status !== 'cancelled'
  const acceptedOffer = request.offers.find((offer) => offer.id === request.acceptedOfferId)
  const visibleOffers = isAssigned
    ? request.offers.filter((offer) => offer.status === 'accepted' || offer.status === 'declined')
    : request.offers

  return (
    <article className={`app-request ${compact ? 'is-compact' : ''}`}>
      <div className="app-request-top">
        <div className="app-vehicle">
          <span className="app-vehicle-icon"><CarFront size={21} /></span>
          <div className="app-vehicle-text">
            <small>{request.id}</small>
            <h3>{request.vehicle.make} {request.vehicle.model} <span>· {request.vehicle.year}</span></h3>
            <p><MapPin size={14} />{request.city}، {request.district}</p>
          </div>
        </div>
        <span className={`app-status is-${meta.tone}`}>{meta.label}</span>
      </div>

      {request.status !== 'cancelled' && (
        <div className="app-progress">
          <Flow step={meta.step} />
          <p><strong>{meta.label}</strong><span>{meta.hint}</span></p>
        </div>
      )}

      <dl className="app-request-meta">
        <div><dt><Clock3 size={14} /> موعد الفحص</dt><dd>{formatArabicDate(request.scheduledAt)}</dd></div>
        <div><dt><Wrench size={14} /> نوع الفحص</dt><dd>{request.services.join('، ') || 'فحص شامل'}</dd></div>
        <div><dt><Gauge size={14} /> العداد</dt><dd>{request.vehicle.mileage ? `${formatArabicNumber(request.vehicle.mileage)} كم` : 'غير مسجل'}</dd></div>
      </dl>

      {isAssigned && acceptedOffer && (
        <p className="app-assigned"><Check size={15} /> تم اختيار الفاحص <strong>{acceptedOffer.inspectorName}</strong> بمبلغ {formatArabicNumber(acceptedOffer.price)} ر.س</p>
      )}

      {/*
        الدفع يظهر فقط بعد قبول عرض، لأن المبلغ المتّفق عليه هو ما يستطيع الخادم
        التحقّق منه. الطلب المدفوع يعرض إيصالًا مختصرًا بدل الزر — وإخفاء الزر
        مقصود: تكرار الدفع ليس إجراءً يجب أن يكون على بُعد نقرة واحدة.
      */}
      {isAssigned && acceptedOffer && (
        <div className="app-pay-cta">
          {request.paymentStatus === 'paid' ? (
            <span className="app-pay-chip is-paid">
              <ShieldCheck size={15} /> مدفوع {formatArabicNumber(request.paymentAmount ?? acceptedOffer.price)} ر.س
              {request.paymentMethod ? ` · ${paymentMethodLabel(request.paymentMethod)}` : ''}
            </span>
          ) : (
            <>
              <span className={`app-pay-chip ${request.paymentStatus === 'failed' ? 'is-failed' : 'is-due'}`}>
                {request.paymentStatus === 'failed'
                  ? <><AlertTriangle size={15} /> لم تكتمل آخر محاولة دفع</>
                  : <><Wallet size={15} /> المبلغ المستحق {formatArabicNumber(acceptedOffer.price)} ر.س</>}
              </span>
              <Link
                href={`/dashboard/requests/${encodeURIComponent(request.id)}/pay`}
                className="btn btn-primary btn-sm"
              >
                <Wallet size={15} /> {request.paymentStatus === 'failed' ? 'أعد المحاولة' : 'ادفع الآن'}
              </Link>
            </>
          )}
        </div>
      )}

      {showOffers && visibleOffers.length > 0 && (
        <section className="app-offers">
          <h4>
            {isAssigned ? 'العروض' : 'عروض الفاحصين'}
            <span>{visibleOffers.length}</span>
          </h4>
          <div className="app-offer-list">
            {visibleOffers.map((offer) => (
              <div key={offer.id} className="app-offer">
                <span className="app-offer-avatar" aria-hidden="true">{Array.from(offer.inspectorName)[0] ?? 'ف'}</span>
                <div className="app-offer-info">
                  <strong>
                    {offer.inspectorName}
                    {offer.status === 'accepted' && <em className="is-accepted">تم الاختيار</em>}
                    {offer.status === 'declined' && <em className="is-declined">لم يتم الاختيار</em>}
                  </strong>
                  <small>{offer.note || 'قدّم الفاحص سعره لفحص السيارة في موقعها.'}</small>
                  <small className="app-offer-time">{formatArabicDate(offer.createdAt)}</small>
                </div>
                <span className="app-offer-price">{formatArabicNumber(offer.price)} <small>ر.س</small></span>
                {!isAssigned && <CustomerOfferActions inspectionId={request.id} offerId={offer.id} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {!isAssigned && request.status === 'open' && visibleOffers.length === 0 && (
        <p className="app-waiting"><Sparkles size={15} /> طلبك منشور على الفاحصين في {request.city}. يظهر أول عرض هنا بمجرد وصوله.</p>
      )}

      <div className="app-request-foot">
        <span>نُشر في {formatArabicDate(request.createdAt, { dateStyle: 'medium' })}</span>
        {request.status === 'completed' && (
          <Link href={`/dashboard/inspections/${encodeURIComponent(request.id)}`} className="btn btn-primary btn-sm">
            <FileText size={15} /> عرض تقرير الفحص
          </Link>
        )}
        {request.status === 'open' && (
          <Link href={`/dashboard/requests#${request.id}`} className="app-inline-link">
            تفاصيل الطلب
          </Link>
        )}
      </div>
    </article>
  )
}
