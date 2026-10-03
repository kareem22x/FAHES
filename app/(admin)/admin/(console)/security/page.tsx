import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Crown, Lock, ShieldCheck, XCircle } from 'lucide-react'
import { GlassBadge, GlassCard, GlassPanel } from '@/components/admin/ui/glass'
import { KpiCard, KpiGrid } from '@/components/admin/kpi-cards'
import { requireAdminPage } from '@/lib/admin/rbac'
import { listAuditEvents } from '@/lib/admin/store'
import { auditEventLabel, auditEventTone } from '@/lib/admin/labels'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'
import { isPlatformOwner, listUsers } from '@/lib/user-store'

export const dynamic = 'force-dynamic'

const SECURITY_EVENTS = [
  'access.blocked_unauthenticated',
  'admin.gate_failed',
  'admin.gate_throttled',
  'admin.gate_denied_not_admin',
  'admin.user_role_denied',
]

const LAYERS = [
  'تسجيل الدخول عبر Clerk، ثم رمز إدارة سري منفصل لكل جلسة (بوابة مستقلة).',
  'كوكي رفع صلاحية موقّع HMAC ومربوط بجلسة Clerk، HttpOnly وSameSite=Strict، وصلاحيته 4 ساعات.',
  'فحص الدور على الخادم في كل صفحة وكل إجراء — لا اعتماد على إخفاء العناصر في الواجهة.',
  'عمليات التعديل كلها Server Actions: التحقق من الأصل (Origin) يتولاه الإطار نفسه، فلا مسار CSRF.',
  'تقييد معدل مزدوج (لكل مدير ولكل IP) على كل إجراء إداري، بحدود أضيق للعمليات الحساسة.',
  'سجل تدقيق يُلزمه محرّك قاعدة البيانات برفض التعديل والحذف — سجل دائم لا يمكن محوه.',
  'حماية من التصعيد: منح «مدير» للمالك فقط، ومنع تعديل حسابك، وحماية حساب المالك، ومنع إزالة آخر مدير.',
  'ترويسات أمنية على الحافة: منع التأطير، ومنع تخمين النوع، وسياسة مرجعية صارمة، ومنع التخزين المؤقت للوحة.',
]

export default async function AdminSecurityPage() {
  await requireAdminPage()

  const [events, users] = await Promise.all([listAuditEvents({ limit: 300 }), listUsers()])
  const securityEvents = events.filter((event) => SECURITY_EVENTS.includes(event.event_type))
  const owners = users.filter((user) => isPlatformOwner({ phone: user.phone, clerkUserId: user.clerkUserId }))
  const admins = users.filter((user) => user.role === 'admin')

  // Presence only — a secret's value must never reach the browser.
  const config = [
    { name: 'SESSION_SECRET', ok: Boolean(process.env.SESSION_SECRET || process.env.APP_SECRET), note: 'توقيع كوكي رفع الصلاحية' },
    { name: 'ADMIN_ACCESS_CODE', ok: Boolean(process.env.ADMIN_ACCESS_CODE), note: 'رمز بوابة الإدارة' },
    { name: 'ADMIN_PHONES', ok: Boolean(process.env.ADMIN_PHONES), note: 'مديرون بالجوال' },
    { name: 'ADMIN_CLERK_IDS', ok: Boolean(process.env.ADMIN_CLERK_IDS), note: 'مديرون بالبريد' },
    { name: 'ADMIN_OWNER_CLERK_IDS', ok: Boolean(process.env.ADMIN_OWNER_CLERK_IDS || process.env.ADMIN_OWNER_PHONES), note: 'حسابات المالك' },
    { name: 'RATE_LIMIT_PEPPER', ok: Boolean(process.env.RATE_LIMIT_PEPPER), note: 'تعمية مفاتيح تقييد المعدل' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <KpiGrid>
        <KpiCard label="حسابات المالك" value={owners.length} tone="amber" hint="بلا بوابة رمز" />
        <KpiCard label="حسابات المديرين" value={admins.length} tone="violet" hint="تخضع لبوابة الرمز" />
        <KpiCard label="أحداث أمنية" value={securityEvents.length} tone="rose" hint="محاولات مرفوضة مسجّلة" />
        <KpiCard label="طبقات الحماية" value={LAYERS.length} tone="emerald" hint="دفاع متعدد الطبقات" />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_.95fr]">
        <GlassCard title="طبقات الحماية المطبّقة">
          <ul className="flex flex-col gap-2.5">
            {LAYERS.map((layer) => (
              <li key={layer} className="flex gap-2.5 text-[11px] leading-6 text-neutral-400">
                <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-emerald-400" />
                <span>{layer}</span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <div className="flex flex-col gap-4">
          <GlassCard title="إعدادات البيئة">
            <ul className="flex flex-col gap-1.5">
              {config.map((item) => (
                <li key={item.name} className="flex items-center gap-2.5 rounded-lg bg-white/[.03] px-3 py-2">
                  {item.ok ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="size-3.5 shrink-0 text-rose-400" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span dir="ltr" className="block truncate text-[11px] font-medium text-neutral-200">
                      {item.name}
                    </span>
                    <span className="block text-[10px] text-neutral-600">{item.note}</span>
                  </span>
                  <span className={item.ok ? 'text-[10px] text-emerald-400' : 'text-[10px] text-rose-400'}>
                    {item.ok ? 'مضبوط' : 'غير مضبوط'}
                  </span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard title="حسابات المالك">
            {owners.length === 0 ? (
              <p className="text-[11px] leading-6 text-neutral-500">
                لا يوجد حساب مالك مُعرَّف. أضف معرّف Clerk إلى{' '}
                <span dir="ltr" className="font-medium text-neutral-300">
                  ADMIN_OWNER_CLERK_IDS
                </span>
                .
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {owners.map((owner) => (
                  <li key={owner.id} className="flex items-center gap-2.5 rounded-lg bg-amber-400/[.07] px-3 py-2">
                    <Crown className="size-3.5 shrink-0 text-amber-300" />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-200">{owner.name}</span>
                    <span className="text-[10px] text-amber-300/80">بلا بوابة رمز</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>

      <GlassPanel className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-100">آخر الأحداث الأمنية</h2>
          <Link href="/admin/audit-logs" className="text-[11px] text-sky-400 hover:text-sky-300">
            السجل الكامل
          </Link>
        </div>
        {securityEvents.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-white/10 px-5 py-8 text-[11px] text-neutral-500">
            <ShieldCheck className="size-4 text-emerald-400" /> لا توجد محاولات وصول مرفوضة مسجّلة — الوضع هادئ.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {securityEvents.slice(0, 12).map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-2">
                <GlassBadge tone={auditEventTone(event.event_type)}>{auditEventLabel(event.event_type)}</GlassBadge>
                <time dir="ltr" className="text-[10px] text-neutral-600">
                  {formatArabicDate(event.created_at, { dateStyle: 'short', timeStyle: 'short' })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-4 text-[11px] leading-6 text-amber-200/90">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          لا تُشارك رمز الإدارة ولا مفاتيح البيئة مع أي شخص. تغيير أي متغير بيئة يتطلب إعادة تشغيل الخادم ليصبح ساريًا.
          عدد الأحداث الأمنية المعروضة {formatArabicNumber(securityEvents.length)}.
        </span>
      </div>
    </div>
  )
}
