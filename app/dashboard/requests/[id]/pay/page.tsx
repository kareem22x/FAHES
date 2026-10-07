import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import {
  ArrowRight,
  CalendarClock,
  CarFront,
  CircleDollarSign,
  MapPin,
  ReceiptText,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Wallet,
} from 'lucide-react'
import { MoyasarCheckout } from '@/components/modules/customer/moyasar-checkout'
import { requireRoles } from '@/lib/auth'
import { getCustomerRequests } from '@/lib/customer-data'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'
import {
  PAYMENT_CURRENCY,
  paymentMethodLabel,
  toHalalas,
} from '@/lib/payments/payment-rules'
import { isPaymentOutcome, paymentKeyMode, paymentModeNotice, paymentOutcomeMessage } from '@/lib/payments/payment-outcomes'
import '@/app/payments.css'

export const metadata = { title: 'دفع طلب الفحص' }

/**
 * عنوان العودة المطلق الذي يطلبه Moyasar في `callback_url`.
 *
 * يُبنى من ترويسات الطلب لا من `NEXT_PUBLIC_APP_URL`، لأن المتغيّر غير مضبوط
 * في البيئة المحلية أصلًا، ولأن عنوان النشر قد يتغيّر (نطاق Vercel المؤقت أو
 * النطاق المخصّص) بلا إعادة نشر. الترويسة تعكس العنوان الذي وصل منه المستخدم
 * فعلًا، وهو العنوان الذي يجب أن يعود إليه.
 */
async function callbackUrlFor(inspectionId: string): Promise<string> {
  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? ''
  const forwardedProto = headerList.get('x-forwarded-proto')
  const protocol = forwardedProto ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
  return `${protocol}://${host}/dashboard/requests/${encodeURIComponent(inspectionId)}/pay`
}

export default async function PayInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ id?: string; status?: string; message?: string; payment?: string }>
}) {
  const session = await requireRoles(['customer'])
  const [{ id }, query] = await Promise.all([params, searchParams])

  const orders = await getCustomerRequests(session.sub)
  const order = orders.find((item) => item.id === id)
  if (!order) notFound()

  const offer = order.offers.find((item) => item.id === order.acceptedOfferId) ?? null
  const isPaid = order.paymentStatus === 'paid'
  const amountHalalas = offer ? toHalalas(offer.price) : null

  // الدفعة العائدة في الرابط. النموذج يضيف `?id=` بعد النجاح.
  const returnedPaymentId = typeof query.id === 'string' && query.id.trim() !== '' ? query.id.trim() : null
  // حالة يمرّرها المشروع بنفسه (الإلغاء مثلًا).
  const initialOutcome = isPaymentOutcome(query.payment) ? query.payment : null

  const vehicleLabel = `${order.vehicle.make} ${order.vehicle.model} · ${order.vehicle.year}`

  // ── لماذا لا يمكن الدفع الآن ──────────────────────────────────────────────
  //
  // الدفع يجري على **سعر عرض مقبول**، لأن هذا المبلغ الوحيد الذي اتّفق عليه
  // الطرفان ويمكن للخادم التحقّق منه. طلب بلا عرض مقبول لا مرجع له ⇒ لا مبلغ
  // موثوق ⇒ لا نموذج دفع. نفس الشرط مفروض في دالة القاعدة، فالنموذج والتحقّق
  // يقولان الشيء نفسه.
  let blocker: { title: string; body: string } | null = null
  if (order.status === 'cancelled') {
    blocker = {
      title: 'الطلب ملغى',
      body: 'لا يمكن دفع طلب ملغى. أنشئ طلبًا جديدًا إن كنت ما زلت بحاجة إلى الفحص.',
    }
  } else if (!offer) {
    blocker = {
      title: 'لم يُقبل عرض بعد',
      body: 'يُفتح الدفع بعد اختيار الفاحص وقبول عرضه، لأن المبلغ يُثبَّت عندها. تابع طلباتك وستجد زر الدفع هنا بمجرد القبول.',
    }
  } else if (amountHalalas === null) {
    blocker = {
      title: 'سعر العرض غير صالح',
      body: 'تعذّر قراءة سعر العرض المقبول، فلا يمكن إنشاء دفعة صحيحة. تواصل مع الدعم.',
    }
  }

  const publishableKey = process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY?.trim() ?? ''
  const callbackUrl = await callbackUrlFor(order.id)
  // الوضع يُشتقّ من المفتاح لا من متغيّر إعداد منفصل، فلا يمكن أن يتباعد
  // التنبيه عن المفاتيح المستخدمة فعلًا.
  const modeNotice = paymentModeNotice(paymentKeyMode(publishableKey))

  return (
    <div className="app-page pay-page">
      <section className="app-page-head">
        <div>
          <span className="app-eyebrow"><Wallet size={14} /> الدفع الإلكتروني</span>
          <h2>دفع طلب الفحص</h2>
          <p>
            طلب رقم {order.id} · {vehicleLabel}
          </p>
        </div>
        <Link href="/dashboard/requests" className="btn btn-ghost">
          <ArrowRight size={16} /> طلباتي
        </Link>
      </section>

      <div className="pay-columns">
        <section className="app-panel pay-summary">
          <header className="app-panel-head">
            <span className="app-panel-icon"><ReceiptText size={20} /></span>
            <div>
              <h2>ملخّص الطلب</h2>
              <p>راجع التفاصيل قبل إتمام الدفع.</p>
            </div>
          </header>

          <dl className="app-info-list">
            <div className="app-info-row">
              <dt><UserRound size={15} /> الفاحص</dt>
              <dd>{offer ? offer.inspectorName : 'لم يُختر فاحص بعد'}</dd>
            </div>
            <div className="app-info-row">
              <dt><CarFront size={15} /> المركبة</dt>
              <dd>{vehicleLabel}</dd>
            </div>
            <div className="app-info-row">
              <dt><MapPin size={15} /> موقع الفحص</dt>
              <dd>{order.city}، {order.district}</dd>
            </div>
            <div className="app-info-row">
              <dt><CalendarClock size={15} /> موعد الفحص</dt>
              <dd>{formatArabicDate(order.scheduledAt)}</dd>
            </div>
          </dl>

          <div className="pay-total">
            <span>المبلغ المستحق</span>
            <strong>
              {offer ? formatArabicNumber(offer.price) : '—'} <small>ر.س</small>
            </strong>
          </div>

          {isPaid && (
            <ul className="pay-receipt">
              <li>
                <span>حالة الدفع</span>
                <strong className="is-paid"><ShieldCheck size={14} /> مدفوع</strong>
              </li>
              {order.paymentAmount !== null && (
                <li>
                  <span>المبلغ المدفوع</span>
                  <strong>{formatArabicNumber(order.paymentAmount)} ر.س</strong>
                </li>
              )}
              {order.paymentMethod && (
                <li>
                  <span>طريقة الدفع</span>
                  <strong>{paymentMethodLabel(order.paymentMethod)}</strong>
                </li>
              )}
              {order.paidAt && (
                <li>
                  <span>تاريخ الدفع</span>
                  <strong>{formatArabicDate(order.paidAt)}</strong>
                </li>
              )}
              {order.paymentId && (
                <li>
                  <span>رقم العملية</span>
                  <strong className="is-mono">{order.paymentId}</strong>
                </li>
              )}
            </ul>
          )}
        </section>

        <section className="app-panel pay-method">
          <header className="app-panel-head">
            <span className="app-panel-icon"><CircleDollarSign size={20} /></span>
            <div>
              <h2>طريقة الدفع</h2>
              <p>بطاقات مدى وفيزا وماستركارد، عبر بوابة Moyasar.</p>
            </div>
          </header>

          {isPaid ? (
            <div className="pay-outcome is-success" role="status">
              <span className="pay-outcome-icon" aria-hidden="true"><ShieldCheck size={22} /></span>
              <div>
                <strong>هذا الطلب مدفوع</strong>
                <p>
                  لا حاجة لإعادة الدفع. تابع حالة الفحص من صفحة طلباتك.
                  {order.paymentMethod ? ` الدفع تم بـ${paymentMethodLabel(order.paymentMethod)}.` : ''}
                </p>
              </div>
              <div className="pay-outcome-actions">
                <Link href="/dashboard/requests" className="btn btn-primary btn-sm">
                  <ArrowRight size={15} /> طلباتي
                </Link>
              </div>
            </div>
          ) : blocker ? (
            <div className="pay-outcome is-info" role="status">
              <span className="pay-outcome-icon" aria-hidden="true"><TriangleAlert size={22} /></span>
              <div>
                <strong>{blocker.title}</strong>
                <p>{blocker.body}</p>
              </div>
              <div className="pay-outcome-actions">
                <Link href="/dashboard/requests" className="btn btn-primary btn-sm">
                  <ArrowRight size={15} /> طلباتي
                </Link>
              </div>
            </div>
          ) : (
            <MoyasarCheckout
              inspectionId={order.id}
              amountHalalas={amountHalalas as number}
              publishableKey={publishableKey}
              description={`فحص مركبة ${order.id}`}
              callbackUrl={callbackUrl}
              initialPaymentId={returnedPaymentId}
              initialOutcome={initialOutcome}
            />
          )}

          {modeNotice && !isPaid && !blocker && (
            <p className="pay-mode-notice" role="status">
              <TriangleAlert size={15} /> {modeNotice}
            </p>
          )}

          {order.paymentStatus === 'failed' && order.paymentFailureReason && !isPaid && (
            <p className="pay-last-failure">
              آخر محاولة دفع لم تكتمل: {order.paymentFailureReason}
            </p>
          )}

          {initialOutcome && !isPaid && (
            <p className="pay-note">{paymentOutcomeMessage(initialOutcome)}</p>
          )}

          <p className="pay-note">
            المبلغ محسوب بالريال السعودي ({PAYMENT_CURRENCY}) على سعر العرض الذي قبلته،
            ويُتحقَّق منه على الخادم قبل تسجيل الطلب مدفوعًا.
          </p>
        </section>
      </div>
    </div>
  )
}
