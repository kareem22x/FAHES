import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  CarFront,
  Clock3,
  FileText,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import RequestCard from '@/components/modules/customer/dashboard/request-card'
import { requireRoles } from '@/lib/auth'
import { getCustomerRequests, summarizeRequests } from '@/lib/customer-data'
import { formatArabicDate, formatArabicNumber, isActiveStatus, statusOf } from '@/lib/inspection-status'
import { getUserById } from '@/lib/user-store'

const flow = [
  { icon: MapPin, title: 'انشر الطلب', text: 'حدد موقع السيارة ونوع الفحص والموعد المناسب.' },
  { icon: BadgeCheck, title: 'اختر الفاحص', text: 'قارن عروض الفاحصين القريبين واختر الأنسب.' },
  { icon: FileText, title: 'استلم التقرير', text: 'تقرير بالصور والملاحظات يصل إلى حسابك.' },
]

export default async function DashboardPage() {
  const session = await requireRoles(['customer'])
  const [user, requests] = await Promise.all([
    getUserById(session.sub),
    getCustomerRequests(session.sub),
  ])
  const summary = summarizeRequests(requests)
  const displayName = user?.name && user.name !== 'عميل' ? user.name : 'بك'
  const latest = requests.slice(0, 3)
  const activeRequest = requests.find((request) => isActiveStatus(request.status))

  return (
    <div className="app-page">
      <section className="app-greeting">
        <div className="app-greeting-copy">
          <span className="app-eyebrow"><Sparkles size={14} /> لوحة العميل</span>
          <h2>أهلًا {displayName} 👋</h2>
          <p>تابع طلبات فحص سياراتك، قارن عروض الفاحصين، واستلم التقارير من مكان واحد.</p>
          <div className="app-greeting-actions">
            <Link href="/requests/new" className="btn btn-primary shine"><Plus size={17} /> طلب فحص جديد</Link>
            {activeRequest && (
              <span className="app-greeting-chip">
                <Clock3 size={15} />
                <span>طلبك الحالي: <strong>{statusOf(activeRequest.status).label}</strong></span>
              </span>
            )}
          </div>
        </div>
        <div className="app-greeting-art" aria-hidden="true">
          <span className="app-greeting-car"><CarFront size={86} strokeWidth={1} /></span>
          <span className="app-greeting-ring" />
        </div>
      </section>

      <section className="app-kpis stagger-on-view" aria-label="ملخص حسابك">
        <article className="app-kpi is-brand">
          <span className="app-kpi-icon"><CarFront size={19} /></span>
          <strong>{formatArabicNumber(summary.active)}</strong>
          <p>طلبات نشطة</p>
          <small>قيد التنفيذ الآن</small>
        </article>
        <article className="app-kpi">
          <span className="app-kpi-icon"><Sparkles size={19} /></span>
          <strong>{formatArabicNumber(summary.pendingOffers)}</strong>
          <p>عروض بانتظار قرارك</p>
          <small>{summary.awaitingOffers > 0 ? `في ${formatArabicNumber(summary.awaitingOffers)} طلب` : 'لا توجد عروض جديدة'}</small>
        </article>
        <article className="app-kpi">
          <span className="app-kpi-icon"><FileText size={19} /></span>
          <strong>{formatArabicNumber(summary.completed)}</strong>
          <p>تقارير جاهزة</p>
          <small>للطلبات المكتملة</small>
        </article>
        <article className="app-kpi">
          <span className="app-kpi-icon"><BadgeCheck size={19} /></span>
          <strong>{formatArabicNumber(summary.total)}</strong>
          <p>إجمالي الطلبات</p>
          <small>منذ إنشاء الحساب</small>
        </article>
      </section>

      <div className="app-columns">
        <section className="app-panel">
          <header className="app-panel-head">
            <div>
              <h2>أحدث طلباتي</h2>
              <p>آخر {formatArabicNumber(latest.length)} طلبات على حسابك.</p>
            </div>
            <Link href="/dashboard/requests" className="app-inline-link">كل الطلبات <ArrowLeft size={15} /></Link>
          </header>

          {latest.length === 0 ? (
            <div className="app-empty">
              <span><CarFront size={22} /></span>
              <strong>ما عندك طلبات فحص حتى الآن</strong>
              <p>أنشئ طلبك الأول، حدد موقع السيارة ونوع الفحص، وستبدأ عروض الفاحصين بالوصول.</p>
              <Link href="/requests/new" className="btn btn-primary btn-sm"><Plus size={16} /> طلب فحص جديد</Link>
            </div>
          ) : (
            <div className="app-request-list">
              {latest.map((request) => <RequestCard key={request.id} request={request} compact />)}
            </div>
          )}
        </section>

        <aside className="app-aside">
          <section className="app-panel">
            <header className="app-panel-head">
              <div><h2>كيف يعمل الفحص؟</h2><p>ثلاث خطوات من الطلب إلى التقرير.</p></div>
            </header>
            <ol className="app-steps">
              {flow.map(({ icon: Icon, title, text }, index) => (
                <li key={title}>
                  <span className="app-step-index">{index + 1}</span>
                  <span className="app-step-icon"><Icon size={18} /></span>
                  <div><strong>{title}</strong><p>{text}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <section className="app-panel is-soft">
            <span className="app-panel-icon"><ShieldCheck size={20} /></span>
            <h2>حسابك محمي</h2>
            <p>تسجيل الدخول والجلسات تُدار عبر Clerk، وقرارات الصلاحية وملكية الطلبات تُتحقق على الخادم قبل أي عرض أو قبول.</p>
            <Link href="/dashboard/profile" className="app-inline-link">إدارة ملفي الشخصي <ArrowLeft size={15} /></Link>
          </section>

          {activeRequest && (
            <section className="app-panel">
              <header className="app-panel-head"><div><h2>موعدك القادم</h2></div></header>
              <p className="app-next-visit">{formatArabicDate(activeRequest.scheduledAt)}</p>
              <p className="app-next-place"><MapPin size={15} /> {activeRequest.city}، {activeRequest.district}</p>
              <p className="app-next-note">{statusOf(activeRequest.status).hint}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
