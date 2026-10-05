import Link from 'next/link'
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  IdCard,
  LifeBuoy,
  Mail,
  MonitorSmartphone,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Star,
  Ticket,
} from 'lucide-react'
import { GlassBadge, GlassPanel } from '@/components/admin/ui/glass'
import { roleLabels } from '@/lib/admin/labels'
import { formatAccountAge, formatLastSeen } from '@/lib/relative-time'
import type { AdminTier } from '@/lib/admin/rbac'
import type { Surface } from '@/lib/surfaces'

/**
 * The staff member's own profile, rendered inside the admin console.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * «ملفي الشخصي» in the admin console used to point at `/account`. That page is
 * the *public* account screen — it renders the marketing `SiteHeader` and a card
 * whose primary action is «مساحة العمل», which for an admin simply bounces back
 * to this console. So an admin left the console, landed on a page styled like the
 * marketing site, and needed a second hop to return. Not a 404, but a dead end in
 * every sense that matters.
 *
 * ── Why one component, three mount points ──────────────────────────────────
 *
 * Support agents *are* admins in this system: there is no `support` role, and
 * `/admin/support` is gated by `requireAdminPage()`. The route names in the
 * original brief (`/admin/settings` for an admin profile, `/admin/support/
 * agent-profile` for a support agent) describe the same screen reached from two
 * different places, so it is written once here and mounted where each audience
 * looks for it. Duplicating the markup would guarantee the two drift apart.
 *
 * ── Why it is hook-free ────────────────────────────────────────────────────
 *
 * No `useState`/`useEffect`, so it renders inside a server component and costs no
 * client bundle. The clock reads happen inside `formatAccountAge` /
 * `formatLastSeen` rather than at the call site — `react-hooks/purity` rejects a
 * bare `Date.now()` in a render body, and a helper default keeps the server and
 * the browser from disagreeing across a hydration boundary.
 */
export type StaffWorkload = {
  /** Tickets currently assigned to this agent and still open. */
  assignedOpen: number
  /** Tickets this agent has resolved or closed. */
  resolved: number
  /** Platform-wide average first response, in minutes. */
  avgFirstResponseMinutes: number | null
}

export function StaffProfile({
  name,
  email,
  phone,
  phoneVerified,
  role,
  tier,
  createdAt,
  lastLoginAt,
  surface,
  workload,
}: {
  name: string
  email: string | null
  phone: string | null
  phoneVerified: boolean
  role: string
  tier: AdminTier
  createdAt: number
  lastLoginAt: number
  surface: Surface | null
  workload?: StaffWorkload
}) {
  const isOwner = tier === 'super_admin'

  return (
    <div className="flex flex-col gap-4">
      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <GlassPanel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[#eef4ff] text-[#2563eb]">
              <IdCard size={22} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#102444]">{name}</h2>
              <p className="text-[11px] text-[#65768d]">
                {isOwner ? 'مالك المنصة' : 'مشرف منصة'} · {roleLabels[role] ?? role}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GlassBadge tone={isOwner ? 'good' : 'neutral'}>
              {isOwner ? 'صلاحية كاملة' : 'صلاحية تشغيلية'}
            </GlassBadge>
            <GlassBadge tone={phoneVerified ? 'good' : 'warn'}>
              {phoneVerified ? 'الجوال موثّق' : 'الجوال غير موثّق'}
            </GlassBadge>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {/* Rendered only when known: `user_profiles` stores no email, so a
              placeholder row here would be permanent noise, not information. */}
          {email && (
            <Row icon={<Mail size={15} />} label="البريد الإلكتروني">
              <span dir="ltr">{email}</span>
            </Row>
          )}
          <Row icon={<Phone size={15} />} label="رقم الجوال">
            <span dir="ltr">{phone ?? 'غير مضاف'}</span>
          </Row>
          <Row icon={phoneVerified ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />} label="توثيق الجوال">
            {phoneVerified ? 'مكتمل' : 'مطلوب'}
          </Row>
          <Row icon={<BadgeCheck size={15} />} label="الدور في النظام">
            {roleLabels[role] ?? role}
          </Row>
          <Row icon={<CalendarClock size={15} />} label="عمر الحساب">
            {formatAccountAge(createdAt)}
          </Row>
          <Row icon={<CalendarClock size={15} />} label="آخر ظهور">
            {formatLastSeen(lastLoginAt)}
          </Row>
        </dl>

        {surface !== null && (
          <p className="mt-4 rounded-lg border border-[#e3eaf2] bg-[#f8fafc] px-3 py-2 text-[11px] leading-5 text-[#65768d]">
            أنت تعمل حاليًا من واجهة <strong className="text-[#102444]">{surface === 'support' ? 'الدعم الفني' : surface === 'inspector' ? 'الفاحص' : 'العميل'}</strong>.
            وضع العرض يغيّر مساحة العمل المعروضة، ولا يغيّر دور حسابك أو صلاحياته.
          </p>
        )}
      </GlassPanel>

      {/* ── Privileges ───────────────────────────────────────────────────── */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-[#2563eb]" />
          <h2 className="text-sm font-semibold text-[#102444]">الصلاحيات</h2>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            isOwner ? 'تعديل صلاحيات المشرفين' : 'الوصول إلى لوحة الإدارة',
            'إدارة المستخدمين والفاحصين',
            'مراجعة الطلبات والتقارير',
            'الدعم الفني والتذاكر',
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-[11px] text-[#475d78]">
              <BadgeCheck size={14} className="shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] leading-6 text-[#77827b]">
          الصلاحيات تُشتق من معرّف الحساب في بيئة الخادم، لا من قيمة مخزّنة في قاعدة البيانات — لذلك
          لا يمكن رفعها من الواجهة.
        </p>
      </GlassPanel>

      {/* ── Support workload ─────────────────────────────────────────────── */}
      {workload && (
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2">
            <LifeBuoy size={16} className="text-[#2563eb]" />
            <h2 className="text-sm font-semibold text-[#102444]">حِمل الدعم الفني</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric
              icon={<Ticket size={15} />}
              label="تذاكر مفتوحة مُسندة إليك"
              value={String(workload.assignedOpen)}
              tone={workload.assignedOpen > 0 ? 'warn' : 'good'}
            />
            <Metric
              icon={<BadgeCheck size={15} />}
              label="تذاكر مُنجزة"
              value={String(workload.resolved)}
              tone="good"
            />
            <Metric
              icon={<Star size={15} />}
              label="متوسط أول رد (المنصة)"
              value={
                workload.avgFirstResponseMinutes === null
                  ? '—'
                  : `${Math.round(workload.avgFirstResponseMinutes)} د`
              }
              tone="neutral"
            />
          </div>
          <Link href="/admin/support" className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563eb] hover:underline">
            الانتقال إلى لوحة الدعم الفني <ArrowLeft size={14} />
          </Link>
        </GlassPanel>
      )}

      {/* ── Account-level security ───────────────────────────────────────── */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2">
          <MonitorSmartphone size={16} className="text-[#2563eb]" />
          <h2 className="text-sm font-semibold text-[#102444]">الأمان وإعدادات الحساب</h2>
        </div>
        <p className="mt-2 text-[11px] leading-6 text-[#65768d]">
          بيانات الدخول وكلمة المرور وتوثيق الهوية تُدار على مستوى الحساب نفسه، لا على مستوى لوحة
          الإدارة — وهي المكان الوحيد الذي يمكن تغييرها منه.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/account"
            className="inline-flex items-center gap-1 rounded-lg border border-[#e3eaf2] bg-white px-3 py-2 text-[11px] font-semibold text-[#102444] transition-colors hover:border-[#c9d8ea] hover:bg-[#f8fafc]"
          >
            إعدادات الحساب والأمان <ArrowLeft size={14} />
          </Link>
          {!phoneVerified && (
            <Link
              href="/verify-phone"
              className="inline-flex items-center gap-1 rounded-lg bg-[#2563eb] px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
            >
              توثيق الرقم الآن <ArrowLeft size={14} />
            </Link>
          )}
        </div>
      </GlassPanel>
    </div>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#f0f4f9] pb-2 last:border-0">
      <dt className="flex items-center gap-2 text-[11px] text-[#65768d]">
        <span className="text-[#94a3b8]">{icon}</span>
        {label}
      </dt>
      <dd className="text-[11px] font-semibold text-[#102444]">{children}</dd>
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'good' | 'warn' | 'neutral'
}) {
  const valueTone =
    tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-[#102444]'
  return (
    <div className="rounded-lg border border-[#e3eaf2] bg-[#f8fafc] px-3 py-3">
      <div className="flex items-center gap-1.5 text-[10px] text-[#65768d]">
        <span className="text-[#94a3b8]">{icon}</span>
        {label}
      </div>
      <p className={`mt-1.5 text-lg font-bold tabular-nums ${valueTone}`}>{value}</p>
    </div>
  )
}
