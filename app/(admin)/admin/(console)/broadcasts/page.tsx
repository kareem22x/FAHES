import { requireAdminPage } from '@/lib/admin/rbac'
import { listBroadcasts, type BroadcastAnnouncement } from '@/lib/admin/extended-store'
import { GlassPanel, GlassCard, GlassBadge, EmptyState, Notice } from '@/components/admin/ui/glass'
import { BroadcastForm } from '@/components/admin/broadcast-form'
import { Megaphone, AlertCircle } from 'lucide-react'
import { broadcastPriorityLabels, broadcastPriorityTone } from '@/lib/admin/labels'

export const dynamic = 'force-dynamic'

export default async function AdminBroadcastsPage() {
  await requireAdminPage()

  const { broadcasts, migrationPending } = await listBroadcasts()

  const active = broadcasts.filter((b) => b.is_active).length
  const emergency = broadcasts.filter((b) => b.priority === 'emergency' && b.is_active).length

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">broadcast_announcements</code> غير موجود. طبّق ترحيل الـ40 وحدة.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Megaphone size={15} />
            <span className="text-[11px]">إعلانات نشطة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#102444]">{active}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <AlertCircle size={15} />
            <span className="text-[11px]">إعلانات طارئة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-rose-600">{emergency}</p>
        </GlassPanel>
      </div>

      <BroadcastForm />

      <GlassCard title="الإعلانات الحالية">
        {broadcasts.length === 0 ? (
          <EmptyState>لا إعلانات حاليًا</EmptyState>
        ) : (
          <div className="flex flex-col gap-2.5">
            {broadcasts.map((b) => (
              <div
                key={b.id}
                className={`rounded-lg border p-3 ${
                  b.priority === 'emergency'
                    ? 'border-rose-200 bg-rose-50'
                    : b.priority === 'high'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-[#e3eaf2] bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GlassBadge tone={broadcastPriorityTone[b.priority] ?? 'neutral'}>
                      {broadcastPriorityLabels[b.priority] ?? b.priority}
                    </GlassBadge>
                    <span className="text-sm font-medium text-[#102444]">{b.title}</span>
                  </div>
                  <GlassBadge tone={b.is_active ? 'good' : 'neutral'}>
                    {b.is_active ? 'نشط' : 'موقوف'}
                  </GlassBadge>
                </div>
                <p className="mt-1.5 text-xs text-[#475d78]">{b.body}</p>
                {b.target_cities.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {b.target_cities.map((city) => (
                      <span key={city} className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[#65768d] ring-1 ring-[#e3eaf2]">
                        {city}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[10px] text-[#94a3b8]">
                  {new Date(b.created_at).toLocaleDateString('ar-SA', { dateStyle: 'short' })}
                  {b.expires_at && ` · ينتهي ${new Date(b.expires_at).toLocaleDateString('ar-SA', { dateStyle: 'short' })}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <p className="admin-footnote">
        الإعلانات تُدفع للفاحصين عبر <code className="admin-code">supabase_realtime</code>.
        الفارغ في <code className="admin-code">target_cities</code> = كل المدن.
      </p>
    </div>
  )
}
