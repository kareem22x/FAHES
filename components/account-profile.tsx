import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CarFront,
  CircleHelp,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { AccountPhoneVerification } from '@/components/account-phone-verification'
import { dashboardPath, requireSession } from '@/lib/auth'
import { formatArabicDate } from '@/lib/inspection-status'
import { normalizePhone } from '@/lib/phone'
import { getUserById } from '@/lib/user-store'
import { currentUser as getClerkUser } from '@clerk/nextjs/server'

const inspectorStatusLabels = {
  none: 'لم يتم التقديم كفاحص',
  pending: 'طلب الفاحص قيد المراجعة',
  approved: 'فاحص معتمد',
  rejected: 'يحتاج طلبك إلى تحديث',
  suspended: 'الحساب موقوف مؤقتًا',
} as const

function InfoRow({
  icon: Icon,
  label,
  value,
  ltr = false,
}: {
  icon: typeof UserRound
  label: string
  value: string
  ltr?: boolean
}) {
  return (
    <div className="app-info-row">
      <dt><Icon size={15} /> {label}</dt>
      <dd dir={ltr ? 'ltr' : undefined}>{value}</dd>
    </div>
  )
}

/**
 * Shared profile content. `/account` and `/dashboard/profile` both render this,
 * so the customer never sees two different versions of their own data.
 */
export default async function AccountProfile() {
  const session = await requireSession()
  if (session.role === 'admin' || session.role === 'admin_pending') {
    redirect(dashboardPath(session.role))
  }

  const [user, clerkUser] = await Promise.all([
    getUserById(session.sub),
    getClerkUser(),
  ])
  if (!user) redirect('/auth/complete')

  const isInspector = session.role === 'inspector'
  const dashboardHref = dashboardPath(session.role)
  const email = clerkUser?.primaryEmailAddress?.emailAddress
  const verifiedClerkPhone = clerkUser?.phoneNumbers.find(
    (item) => item.id === clerkUser.primaryPhoneNumberId && item.verification?.status === 'verified',
  ) ?? clerkUser?.phoneNumbers.find((item) => item.verification?.status === 'verified')
  const verifiedSaudiPhone = verifiedClerkPhone && /^5\d{8}$/.test(normalizePhone(verifiedClerkPhone.phoneNumber))
    ? normalizePhone(verifiedClerkPhone.phoneNumber)
    : null
  const canApply = !isInspector && user.inspectorStatus !== 'pending' && user.inspectorStatus !== 'suspended'

  return (
    <div className="app-profile">
      <section className="app-panel">
        <header className="app-panel-head">
          <span className="app-panel-icon"><UserRound size={20} /></span>
          <div>
            <h2>معلومات الحساب</h2>
            <p>البيانات المسجلة في ملفك لدى فاحص.</p>
          </div>
          <span className="app-badge is-done"><BadgeCheck size={14} /> حساب نشط</span>
        </header>
        <dl className="app-info-list">
          <InfoRow icon={UserRound} label="الاسم" value={user.name} />
          <InfoRow icon={Phone} label="رقم الجوال" value={session.phone ? `+966 ${session.phone}` : 'غير مضاف'} ltr={Boolean(session.phone)} />
          <InfoRow icon={Mail} label="البريد الإلكتروني" value={email || 'غير مضاف'} ltr={Boolean(email)} />
          <InfoRow icon={ShieldCheck} label="نوع الحساب" value={isInspector ? 'فاحص معتمد' : 'عميل'} />
          <InfoRow icon={CalendarDays} label="تاريخ إنشاء الحساب" value={formatArabicDate(user.createdAt, { dateStyle: 'long' })} />
          {!isInspector && <InfoRow icon={BadgeCheck} label="حالة طلب الفاحص" value={inspectorStatusLabels[user.inspectorStatus]} />}
        </dl>
      </section>

      <aside className="app-aside">
        <AccountPhoneVerification
          verifiedPhone={verifiedSaudiPhone}
          databasePhone={session.phone}
        />

        <section className="app-panel is-soft">
          <span className="app-panel-icon"><ShieldCheck size={20} /></span>
          <h2>أمان الحساب</h2>
          <p>تسجيل الدخول والجلسات تُدار عبر Clerk. لا نشارك رقمك أو بريدك مع الفاحصين، ويظهر لهم ما يلزم لتنفيذ الفحص فقط.</p>
        </section>

        {canApply && (
          <section className="app-panel">
            <span className="app-panel-icon"><CarFront size={20} /></span>
            <h2>عندك خبرة في فحص السيارات؟</h2>
            <p>قدّم طلب الانضمام إلى شبكة الفاحصين، وسنراجع خبرتك ومدن تغطيتك.</p>
            <Link href="/become-inspector" className="btn btn-dark btn-sm">انضم كفاحص <ArrowLeft size={15} /></Link>
          </section>
        )}

        <Link href={dashboardHref} className="app-panel-link">
          <span><CarFront size={17} /> {isInspector ? 'لوحة الفاحص' : 'لوحة العميل'}</span>
          <ArrowLeft size={16} />
        </Link>
        <Link href="/help" className="app-panel-link">
          <span><CircleHelp size={17} /> مركز المساعدة</span>
          <ArrowLeft size={16} />
        </Link>
      </aside>
    </div>
  )
}
