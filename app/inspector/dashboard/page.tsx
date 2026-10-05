import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CarFront,
  Check,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  MapPin,
  Navigation,
  ShieldCheck,
  Star,
  WalletCards,
} from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { SurfaceExit } from '@/components/admin/surface-exit'
import InspectorDashboardHeader from '@/components/modules/inspector/dashboard-header'
import { InspectorOfferForm } from '@/components/modules/inspector/offer-form'
import { InspectorProfileSettings } from '@/components/modules/inspector/profile-settings'
import { SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import { requireRoles } from '@/lib/auth'
import { countUnreadNotifications, listNotifications } from '@/lib/notifications/store'
import {
  listAssignedInspectionsForInspector,
  listCompletedInspectionsForInspector,
  listOpenInspectionsForInspector,
} from '@/lib/inspection-store'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'
import { maskPhone } from '@/lib/phone'
import { getUserById } from '@/lib/user-store'

const navigation = [
  { href: '/inspector/dashboard', label: 'الرئيسية', icon: BriefcaseBusiness },
  { href: '#requests', label: 'طلبات الفحص', icon: ClipboardCheck },
  { href: '#assigned', label: 'الفحوصات المسندة', icon: CarFront },
  { href: '/inspector/dashboard#schedule', label: 'المواعيد', icon: CalendarDays },
  { href: '/inspector/dashboard#reports', label: 'التقارير', icon: FileText },
  { href: '/inspector/dashboard#earnings', label: 'الأرباح', icon: WalletCards },
  { href: '/inspector/dashboard#ratings', label: 'التقييمات', icon: Star },
  { href: '/inspector/dashboard#notifications', label: 'الإشعارات', icon: Bell },
  { href: '#work-area', label: 'الملف الشخصي', icon: MapPin },
  { href: '/inspector/dashboard#verification', label: 'حالة الاعتماد', icon: ShieldCheck },
  { href: '/inspector/dashboard#support', label: 'المساعدة', icon: CircleHelp },
]

function isToday(value: string) {
  return new Date(value).toDateString() === new Date().toDateString()
}

export default async function InspectorDashboardPage() {
  const session = await requireRoles(['inspector'])
  const user = await getUserById(session.sub)
  const inspectorProfile = user?.inspectorProfile
  const selectedCities = inspectorProfile?.cities ?? []
  const isOnline = inspectorProfile?.isOnline ?? false
  const [requests, assigned, completed] = await Promise.all([
    listOpenInspectionsForInspector(session.sub, selectedCities),
    listAssignedInspectionsForInspector(session.sub),
    listCompletedInspectionsForInspector(session.sub),
  ])
  const [notifications, unreadNotifications] = await Promise.all([
    listNotifications(session.sub),
    countUnreadNotifications(session.sub),
  ])
  const newRequests = requests.filter((request) => !request.myOffer)
  const todayAppointments = assigned.filter((inspection) => isToday(inspection.scheduledAt))
  // Shared formatters so prices and dates read identically across the product.
  const currency = { format: (value: number) => formatArabicNumber(value) }
  const dateFormat = { format: (value: Date | number | string) => formatArabicDate(value instanceof Date ? value.getTime() : value) }

  return (
    <main dir="rtl" className="inspector-dashboard">
      <div className="inspector-dashboard-layout">
        <aside className="inspector-sidebar" aria-label="التنقل في لوحة موظف الفحص">
          <Link href="/" className="inspector-logo">
            <BrandMark className="inspector-logo-mark" />
            <span>فاحص<span>.</span><small>لوحة موظف الفحص</small></span>
          </Link>

          <p className="inspector-nav-caption">مساحة العمل</p>
          <nav>
            {navigation.map(({ href, label, icon: Icon }, index) => (
              <a key={href} href={href} className={index === 0 ? 'is-current' : ''}>
                <Icon size={17} />{label}
                {href === '#requests' && newRequests.length > 0 && <span className="inspector-nav-count">{newRequests.length}</span>}
              </a>
            ))}
          </nav>

          <div className="inspector-sidebar-help">
            <span><CircleHelp size={18} /></span>
            <strong>تحتاج مساعدة؟</strong>
            <p>راجع إعدادات مدن العمل أو تواصل مع إدارة المنصة.</p>
            <a href="#support">مركز المساعدة <ArrowLeft size={14} /></a>
          </div>
          <div className="inspector-sidebar-user">
            <span className="inspector-user-avatar">{(user?.name || 'ف').slice(0, 1)}</span>
            <span><strong>{user?.name || 'موظف الفحص'}</strong><small>موظف فحص · {maskPhone(session.phone)}</small></span>
            <LogoutButton />
          </div>
        </aside>

        <div className="inspector-workspace">
          <header className="inspector-topbar">
            <div>
              <div className="inspector-breadcrumb"><span>فاحص</span><span>/</span><strong>مساحة العمل</strong></div>
              <p className="inspector-topbar-description">متابعة طلبات الفحص والمواعيد في مدن التغطية.</p>
            </div>
            <div className="inspector-topbar-actions">
              {/* Only an owner standing in the inspector surface sees this. A real
                  inspector has no admin console to return to, so the control is
                  keyed on the surface rather than on `requireRoles` admitting the
                  request — owners are admitted to every console by design. */}
              {session.surface === 'inspector' && <SurfaceExit />}
              <span className={`inspector-status-pill ${isOnline ? 'is-online' : ''}`}>
                <span />{isOnline ? 'متصل' : 'غير متاح'}
              </span>
              <InspectorDashboardHeader
                initialNotifications={notifications}
                initialUnread={unreadNotifications}
                name={user?.name || 'موظف الفحص'}
                phone={session.phone ?? ''}
                verified={session.phoneVerified}
              />
            </div>
          </header>

          <div className="inspector-content">
            <section id="overview" className="inspector-welcome">
              <div>
                <span className="inspector-section-kicker"><span className="inspector-kicker-dot" /> لوحة اليوم</span>
                <h1>مرحبًا، {user?.name || 'موظف الفحص'} <span aria-hidden="true">👋</span></h1>
                <p>إليك ملخص طلبات ومواعيد الفحص الخاصة بك.</p>
              </div>
              <span className="inspector-approved-badge"><BadgeCheck size={17} /> موظف معتمد</span>
            </section>

            <section className="inspector-stats-grid" aria-label="ملخص أعمال الفحص">
              <a href="#requests" className="inspector-stat-card">
                <span className="inspector-stat-icon"><ClipboardCheck size={19} /></span>
                <span className="inspector-stat-label">طلبات جديدة</span>
                <strong>{newRequests.length}</strong>
                <small>في المدن التي تغطيها</small>
              </a>
              <a href="#schedule" className="inspector-stat-card">
                <span className="inspector-stat-icon"><CalendarDays size={19} /></span>
                <span className="inspector-stat-label">مواعيد اليوم</span>
                <strong>{todayAppointments.length}</strong>
                <small>طلبات مسندة اليوم</small>
              </a>
              <a href="#assigned" className="inspector-stat-card">
                <span className="inspector-stat-icon"><CarFront size={19} /></span>
                <span className="inspector-stat-label">فحوصات مسندة</span>
                <strong>{assigned.length}</strong>
                <small>بانتظار تنفيذ الفحص</small>
              </a>
              <a href="#reports" className="inspector-stat-card">
                <span className="inspector-stat-icon"><FileText size={19} /></span>
                <span className="inspector-stat-label">تقارير مكتملة</span>
                <strong>{completed.length}</strong>
                <small>تقارير أرسلت للعملاء</small>
              </a>
            </section>

            <div className="inspector-notice">
              <span><ShieldCheck size={18} /></span>
              <p><strong>خصوصية العميل أولًا.</strong> لا يظهر رقم جوال العميل في لوحة الطلبات. يظهر عنوان السيارة للفاحصين المعتمدين في مدينة الطلب فقط.</p>
            </div>

            <section id="schedule" className="inspector-panel inspector-schedule-section">
              <div className="inspector-section-heading">
                <div><span className="inspector-section-kicker"><CalendarDays size={14} /> جدول اليوم</span><h2>المواعيد القادمة</h2></div>
                <span className="inspector-section-count">{assigned.length} موعد</span>
              </div>
              {assigned.length === 0 ? (
                <div className="inspector-empty-state">
                  <span><CalendarDays size={23} /></span>
                  <h3>لا توجد مواعيد مسندة حتى الآن</h3>
                  <p>بعد قبول العميل لأحد عروضك، سيظهر موعد الفحص هنا.</p>
                </div>
              ) : (
                <div className="inspector-schedule-list">
                  {assigned.map((inspection) => (
                    <article key={inspection.id} className="inspector-schedule-item">
                      <div className="inspector-schedule-time">
                        <strong>{new Date(inspection.scheduledAt).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' })}</strong>
                        <small>{new Date(inspection.scheduledAt).toLocaleDateString('ar-SA', { dateStyle: 'medium' })}</small>
                      </div>
                      <span className="inspector-schedule-marker" />
                      <div className="inspector-schedule-content">
                        <div><strong>{inspection.vehicle.make} {inspection.vehicle.model} {inspection.vehicle.year}</strong><span className="inspector-request-status">موعد مؤكد</span></div>
                        <p><MapPin size={14} />{inspection.city}، {inspection.district}<span>·</span>{inspection.services.join('، ')}</p>
                      </div>
                      <Link href={`/inspector/dashboard/inspections/${encodeURIComponent(inspection.id)}`} className="inspector-inline-link">التفاصيل <ArrowUpRight size={15} /></Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div id="work-area" className="inspector-main-grid">
              <InspectorProfileSettings
                cities={selectedCities}
                isOnline={isOnline}
                availableCities={SUPPORTED_CITIES}
              />

              <aside id="verification" className="inspector-side-card">
                <span className="inspector-side-card-icon"><BadgeCheck size={20} /></span>
                <h2>جاهز لاستقبال الطلبات؟</h2>
                <p>حدد المدن التي تغطيها وفعّل حالة التوفر عند استعدادك لتقديم عروض جديدة.</p>
                <div className="inspector-check-row"><BadgeCheck size={16} /><span>الاعتماد</span><strong>مكتمل</strong></div>
                <div className="inspector-check-row"><MapPin size={16} /><span>مدن التغطية</span><strong>{selectedCities.length ? `${selectedCities.length} مدن` : 'غير محددة'}</strong></div>
                <div className="inspector-check-row"><ClipboardCheck size={16} /><span>طلبات بانتظار عرضك</span><strong>{newRequests.length}</strong></div>
                <a href="#requests" className="inspector-details-link">استعراض الطلبات <ArrowLeft size={15} /></a>
              </aside>
            </div>

            <section id="requests" className="inspector-requests-section">
              <div className="inspector-requests-heading">
                <div><span className="inspector-section-kicker"><ClipboardCheck size={14} /> فرص الفحص</span><h2>طلبات فحص جديدة</h2></div>
                <span className="inspector-section-count">{requests.length} طلب</span>
              </div>
              {requests.length === 0 ? (
                <div className="inspector-empty-state">
                  <span><CarFront size={24} /></span>
                  <h3>{isOnline ? 'لا توجد طلبات فحص جديدة' : 'فعّل حالة التوفر لتقديم عروض'}</h3>
                  <p>{selectedCities.length ? 'ستظهر هنا الطلبات المنشورة في المدن التي اخترتها.' : 'اختر مدن العمل واحفظها لتظهر الطلبات المناسبة لك.'}</p>
                </div>
              ) : (
                <div className="inspector-request-list">
                  {requests.map((request) => (
                    <article key={request.id} className="inspector-request-card">
                      <div className="inspector-request-card-top">
                        <div className="inspector-request-vehicle">
                          <span className="inspector-request-car-icon"><CarFront size={20} /></span>
                          <div>
                            <span className="inspector-request-number">{request.id}</span>
                            <h3>{request.vehicle.make} {request.vehicle.model} <span>{request.vehicle.year}</span></h3>
                          </div>
                        </div>
                        <span className="inspector-request-status">{request.myOffer ? 'تم تقديم عرضك' : 'بانتظار الفاحص'}</span>
                      </div>
                      <div className="inspector-request-details">
                        <div><MapPin size={15} /><span><small>موقع السيارة</small><strong>{request.city}، {request.district}</strong><span className="inspector-request-address">{request.address}</span></span></div>
                        <div><Navigation size={15} /><span><small>نوع الفحص</small><strong>{request.services.join('، ')}</strong></span></div>
                        <div><Clock3 size={15} /><span><small>الموعد المطلوب</small><strong>{dateFormat.format(new Date(request.scheduledAt))}</strong></span></div>
                        {request.vehicle.mileage !== null && <div><CarFront size={15} /><span><small>الممشى</small><strong>{currency.format(request.vehicle.mileage)} كم</strong></span></div>}
                      </div>
                      {request.notes && <p className="inspector-request-note"><strong>ملاحظات العميل:</strong> {request.notes}</p>}
                      <div className="inspector-request-actions">
                        <Link href={`/inspector/dashboard/inspections/${encodeURIComponent(request.id)}`} className="inspector-details-link">عرض الطلب <ArrowLeft size={15} /></Link>
                        {request.myOffer ? (
                          <div className="inspector-offer-submitted"><Check size={15} /> عرضك <strong>{currency.format(request.myOffer.price)} ر.س</strong> بانتظار رد العميل</div>
                        ) : isOnline ? (
                          <InspectorOfferForm inspectionId={request.id} />
                        ) : (
                          <p className="inspector-offline-hint">فعّل حالة التوفر لتقديم عرض.</p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section id="assigned" className="inspector-requests-section inspector-followup-section">
              <div className="inspector-requests-heading">
                <div><span className="inspector-section-kicker"><CarFront size={14} /> بعد اختيار العرض</span><h2>الفحوصات المسندة</h2></div>
                <span className="inspector-section-count">{assigned.length} فحص</span>
              </div>
              {assigned.length === 0 ? (
                <div className="inspector-empty-state">
                  <span><ClipboardCheck size={23} /></span>
                  <h3>لا توجد فحوصات مسندة</h3>
                  <p>عند قبول العميل لعرضك، سيظهر الطلب هنا ويمكنك فتح خطوات الفحص.</p>
                </div>
              ) : (
                <div className="inspector-assigned-list">
                  {assigned.map((inspection) => (
                    <article key={inspection.id} className="inspector-assigned-card">
                      <div className="inspector-assigned-main">
                        <span className="inspector-request-car-icon"><CarFront size={20} /></span>
                        <div><span className="inspector-request-number">{inspection.id}</span><h3>{inspection.vehicle.make} {inspection.vehicle.model} · {inspection.vehicle.year}</h3><p><MapPin size={14} />{inspection.city}، {inspection.district}</p></div>
                      </div>
                      <div className="inspector-assigned-info"><small>موعد الفحص</small><strong>{dateFormat.format(new Date(inspection.scheduledAt))}</strong></div>
                      <div className="inspector-assigned-info"><small>عرضك المقبول</small><strong>{inspection.myOffer ? `${currency.format(inspection.myOffer.price)} ر.س` : '—'}</strong></div>
                      <Link href={`/inspector/dashboard/inspections/${encodeURIComponent(inspection.id)}`} className="inspector-primary-link">افتح سير الفحص <ArrowLeft size={15} /></Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section id="reports" className="inspector-requests-section">
              <div className="inspector-requests-heading"><div><span className="inspector-section-kicker"><FileText size={14} /> التقارير الصادرة</span><h2>تقارير الفحص</h2></div><span className="inspector-section-count">{completed.length} تقرير</span></div>
              {completed.length === 0 ? <div className="inspector-empty-state"><span><FileText size={22} /></span><h3>لا توجد تقارير مكتملة</h3><p>تظهر تقاريرك هنا بعد إنهاء الفحص وإرساله للعميل.</p></div> : <div className="inspector-assigned-list">
                {completed.map((inspection) => <article key={inspection.id} className="inspector-assigned-card">
                  <div className="inspector-assigned-main"><span className="inspector-request-car-icon"><FileText size={19} /></span><div><span className="inspector-request-number">{inspection.id}</span><h3>{inspection.vehicle.make} {inspection.vehicle.model} · {inspection.vehicle.year}</h3><p><MapPin size={14} />{inspection.city}، {inspection.district}</p></div></div>
                  <div className="inspector-assigned-info"><small>الخدمات</small><strong>{inspection.services.join('، ')}</strong></div>
                  <Link href={`/inspector/dashboard/inspections/${encodeURIComponent(inspection.id)}`} className="inspector-primary-link">عرض التقرير <ArrowLeft size={14} /></Link>
                </article>)}
              </div>}
            </section>

            <section id="earnings" className="inspector-empty-panel">
              <span className="inspector-side-card-icon"><WalletCards size={19} /></span>
              <div id="ratings">
                <div><h2>الأرباح والتقييمات</h2><p>لا توجد بيانات أرباح أو تقييمات مسجلة حتى الآن.</p></div>
                <span className="inspector-feature-status">لا توجد بيانات</span>
              </div>
            </section>

            <section id="notifications" className="inspector-empty-panel">
              <span className="inspector-side-card-icon"><Bell size={19} /></span>
              <div><h2>الإشعارات</h2><p>ستظهر إشعارات الطلبات والمواعيد في هذا القسم عند تفعيلها.</p></div>
              <span className="inspector-feature-status">لا توجد إشعارات</span>
            </section>

            <section id="support" className="inspector-empty-panel">
              <span className="inspector-side-card-icon"><CircleHelp size={19} /></span>
              <div><h2>مركز المساعدة</h2><p>للمساعدة بشأن اعتماد الحساب أو الطلبات، راجع إدارة المنصة.</p></div>
              <Link href="/become-inspector" className="inspector-details-link">بيانات الاعتماد <ArrowLeft size={15} /></Link>
            </section>

            <footer className="inspector-footer">فاحص · لوحة موظف الفحص <span>بيانات العملاء وعناوين المركبات محمية.</span></footer>
          </div>

          <nav className="inspector-mobile-nav" aria-label="التنقل السريع">
            {navigation.slice(0, 4).map(({ href, label, icon: Icon }, index) => (
              <a key={href} href={href} className={index === 0 ? 'is-current' : ''}>
                <Icon size={19} /><span>{label}</span>
              </a>
            ))}
          </nav>
        </div>
      </div>
    </main>
  )
}
