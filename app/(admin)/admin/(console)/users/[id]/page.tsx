import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Eye, Lock, ShieldCheck } from 'lucide-react'
import { GlassBadge, GlassCard, GlassPanel, EmptyState } from '@/components/admin/ui/glass'
import { RecordUserView } from '@/components/admin/record-user-view'
import { requireAdminPage } from '@/lib/admin/rbac'
import { getUserDetail } from '@/lib/admin/store'
import { auditEventLabel, auditEventTone, inspectorStatusLabels, roleBadgeClasses, roleLabels } from '@/lib/admin/labels'
import { formatArabicDate, formatArabicNumber, statusOf } from '@/lib/inspection-status'
import { maskPhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

/**
 * Read-only user file ("view as").
 *
 * This is deliberately NOT session-swapping impersonation. Swapping the session
 * would mean minting credentials for another identity, which is the single
 * largest privilege-escalation vector an admin panel can ship. The console
 * shows everything the product itself would show that user — never a token,
 * never a secret — and records that the file was opened.
 */
export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  const detail = await getUserDetail(id)
  if (!detail) notFound()

  const { user, inspections, offers, auditTrail } = detail
  const activeInspections = inspections.filter((item) => item.status !== 'completed' && item.status !== 'cancelled')

  return (
    <div className="flex flex-col gap-4">
      <RecordUserView userId={user.id} />

      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/users" className="flex items-center gap-1 text-[11px] text-[#2563eb] hover:text-[#1d4ed8]">
          <ArrowRight className="size-3" /> كل المستخدمين
        </Link>
        <GlassBadge tone="warn">
          <Eye className="size-3" /> عرض للقراءة فقط
        </GlassBadge>
        <GlassBadge tone="neutral">
          <Lock className="size-3" /> لا تُعرض بيانات اعتماد
        </GlassBadge>
      </div>

      <GlassPanel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-medium text-[#0f172a]">{user.name}</h2>
            <p dir="ltr" className="mt-1 text-right text-[11px] text-[#64748b]">
              {maskPhone(user.phone)}
            </p>
            <p dir="ltr" className="mt-0.5 text-right text-[10px] text-[#94a3b8]">
              {user.id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${roleBadgeClasses[user.role]}`}>
              {roleLabels[user.role] ?? user.role}
            </span>
            <GlassBadge tone={user.inspectorStatus === 'approved' ? 'good' : user.inspectorStatus === 'pending' ? 'warn' : 'neutral'}>
              <ShieldCheck className="size-3" />
              {inspectorStatusLabels[user.inspectorStatus]}
            </GlassBadge>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            { label: 'إجمالي الطلبات', value: formatArabicNumber(inspections.length) },
            { label: 'طلبات نشطة', value: formatArabicNumber(activeInspections.length) },
            { label: 'عروض مقدَّمة', value: formatArabicNumber(offers.length) },
            { label: 'تاريخ التسجيل', value: formatArabicDate(user.createdAt) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <dt className="text-[10px] text-[#64748b]">{item.label}</dt>
              <dd className="mt-1 text-sm font-medium text-[#0f172a]">{item.value}</dd>
            </div>
          ))}
        </dl>
      </GlassPanel>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <GlassCard title={`طلبات الفحص (${formatArabicNumber(inspections.length)})`}>
          {inspections.length === 0 ? (
            <EmptyState>لا توجد طلبات لهذا الحساب.</EmptyState>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {inspections.slice(0, 12).map((inspection) => {
                const meta = statusOf(inspection.status)
                return (
                  <li key={inspection.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-[#0f172a]">
                        {inspection.vehicle.make} {inspection.vehicle.model}
                      </p>
                      <p dir="ltr" className="text-right text-[10px] text-[#94a3b8]">
                        {inspection.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#64748b]">{inspection.city}</span>
                      <GlassBadge tone={meta.tone === 'done' ? 'good' : meta.tone === 'cancelled' ? 'bad' : 'neutral'}>
                        {meta.label}
                      </GlassBadge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </GlassCard>

        <div className="flex flex-col gap-4">
          {offers.length > 0 && (
            <GlassCard title={`العروض المقدَّمة (${formatArabicNumber(offers.length)})`}>
              <ul className="divide-y divide-[#f1f5f9]">
                {offers.slice(0, 8).map((offer) => (
                  <li key={offer.id} className="flex items-center justify-between gap-2 py-2">
                    <span dir="ltr" className="truncate text-[10px] text-[#94a3b8]">
                      {offer.inspection_id}
                    </span>
                    <span className="text-xs text-[#0f172a]">{formatArabicNumber(Number(offer.price))} ر.س</span>
                    <GlassBadge tone={offer.status === 'accepted' ? 'good' : offer.status === 'declined' ? 'bad' : 'warn'}>
                      {offer.status}
                    </GlassBadge>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          <GlassCard title="سجل النشاط">
            {auditTrail.length === 0 ? (
              <EmptyState>لا توجد أحداث مرتبطة بهذا الحساب.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {auditTrail.slice(0, 10).map((event) => (
                  <li key={event.id} className="flex items-center gap-2">
                    <GlassBadge tone={auditEventTone(event.event_type)}>{auditEventLabel(event.event_type)}</GlassBadge>
                    <time dir="ltr" className="mr-auto shrink-0 text-[10px] text-[#94a3b8]">
                      {formatArabicDate(event.created_at, { dateStyle: 'short', timeStyle: 'short' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
