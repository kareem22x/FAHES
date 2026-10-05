import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  IdCard,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { InspectorShell } from '@/components/modules/inspector/inspector-shell'
import { InspectorProfileSettings } from '@/components/modules/inspector/profile-settings'
import { requireRoles } from '@/lib/auth'
import { countUnreadNotifications, listNotifications } from '@/lib/notifications/store'
import { SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import { formatArabicDate } from '@/lib/inspection-status'
import { getUserById } from '@/lib/user-store'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الملف الشخصي — فاحص' }

/**
 * The inspector's own profile and settings, inside the inspector workspace.
 *
 * ── Why this page exists ───────────────────────────────────────────────────
 *
 * The profile menu in the inspector header used to send the inspector to
 * `/account`. That page is the *public* account screen: it renders the marketing
 * site header (`SiteHeader`) and a card whose primary action is «مساحة العمل»,
 * which for an inspector just bounces back to this dashboard. So the inspector
 * left their workspace, landed on a page styled like the marketing site, and
 * had to take a second hop to return — a dead end in every sense except the
 * literal 404.
 *
 * Everything an inspector can actually change lives here instead: the work
 * scope (cities + availability, which drive which orders they even see) and the
 * identity/verification state. Security settings that genuinely belong to the
 * shared account — adding a phone, national-ID verification — still live at
 * `/account`, and are linked rather than duplicated, because they are the same
 * account-level facts for every role.
 */
export default async function InspectorSettingsPage() {
  const session = await requireRoles(['inspector'])
  const user = await getUserById(session.sub)
  const inspectorProfile = user?.inspectorProfile
  const selectedCities = inspectorProfile?.cities ?? []
  const isOnline = inspectorProfile?.isOnline ?? false

  const [notifications, unread] = await Promise.all([
    listNotifications(session.sub),
    countUnreadNotifications(session.sub),
  ])

  const name = user?.name || 'موظف الفحص'

  return (
    <InspectorShell
      active="profile"
      breadcrumb="الملف الشخصي"
      description="بياناتك، نطاق عملك، وحالة التحقق."
      name={name}
      phone={session.phone}
      phoneVerified={session.phoneVerified}
      isOnline={isOnline}
      notifications={notifications}
      unread={unread}
      ownerSurface={session.surface === 'inspector'}
    >
      <section className="inspector-welcome">
        <div>
          <span className="inspector-section-kicker"><span className="inspector-kicker-dot" /> إعدادات الحساب</span>
          <h1>الملف الشخصي</h1>
          <p>راجع بياناتك، وحدّث مدن العمل والتوفر، وتأكد من توثيق رقم جوالك.</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-bold ${
            session.phoneVerified
              ? 'border-[#d7e9dc] bg-[#f1f7f2] text-[#36724b]'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {session.phoneVerified ? <BadgeCheck size={17} /> : <ShieldAlert size={17} />}
          {session.phoneVerified ? 'الحساب موثّق' : 'الجوال غير موثّق'}
        </span>
      </section>

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <section className="inspector-panel p-5 sm:p-7" aria-labelledby="inspector-identity-title">
        <span className="inspector-section-kicker"><IdCard size={14} /> الهوية</span>
        <h2 id="inspector-identity-title" className="mt-2 text-xl font-bold">بيانات الحساب</h2>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="inspector-check-row">
            <IdCard size={16} />
            <span>الاسم</span>
            <strong>{name}</strong>
          </div>
          <div className="inspector-check-row">
            <Phone size={16} />
            <span>رقم الجوال</span>
            <strong dir="ltr">{session.phone ?? 'غير مضاف'}</strong>
          </div>
          <div className="inspector-check-row">
            <ShieldCheck size={16} />
            <span>حالة التوثيق</span>
            <strong>{session.phoneVerified ? 'موثّق' : 'بانتظار التوثيق'}</strong>
          </div>
          <div className="inspector-check-row">
            <BadgeCheck size={16} />
            <span>الاعتماد</span>
            <strong>فاحص معتمد</strong>
          </div>
          {inspectorProfile?.updatedAt && (
            <div className="inspector-check-row">
              <MapPin size={16} />
              <span>آخر تحديث للنطاق</span>
              <strong>{formatArabicDate(inspectorProfile.updatedAt)}</strong>
            </div>
          )}
        </div>

        <p className="mt-5 text-xs leading-6 text-[#77827b]">
          لتغيير الاسم أو إضافة رقم جوال جديد، انتقل إلى إعدادات الحساب العامة — فهذه بيانات على مستوى
          الحساب نفسه، لا على مستوى العمل الميداني.
        </p>
      </section>

      {/* ── Work scope ───────────────────────────────────────────────────── */}
      <InspectorProfileSettings
        cities={selectedCities}
        isOnline={isOnline}
        availableCities={SUPPORTED_CITIES}
      />

      {/* ── Security ─────────────────────────────────────────────────────── */}
      <section className="inspector-side-card">
        <span className="inspector-side-card-icon">
          {session.phoneVerified ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
        </span>
        <h2>الأمان والتحقق</h2>
        <p>
          {session.phoneVerified
            ? 'رقم جوالك موثّق. يمكنك إدارة بيانات الدخول من إعدادات الحساب.'
            : 'وثّق رقم جوالك لتفعيل استقبال الطلبات وإرسال العروض.'}
        </p>
        <div className="inspector-check-row">
          <Phone size={16} />
          <span>توثيق الجوال</span>
          <strong>{session.phoneVerified ? 'مكتمل' : 'مطلوب'}</strong>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/account" className="inspector-details-link">
            إعدادات الحساب والأمان <ArrowLeft size={15} />
          </Link>
          {!session.phoneVerified && (
            <Link href="/verify-phone" className="inspector-primary-link">
              توثيق الرقم الآن <ArrowLeft size={15} />
            </Link>
          )}
        </div>
      </section>

      <footer className="inspector-footer">
        فاحص · لوحة موظف الفحص <span>بيانات العملاء وعناوين المركبات محمية.</span>
      </footer>
    </InspectorShell>
  )
}
