import { requireAdminPage } from '@/lib/admin/rbac'
import { listPricingRules, listGeofenceZones } from '@/lib/admin/extended-store'
import { GlassPanel, GlassCard, GlassBadge, EmptyState, Notice } from '@/components/admin/ui/glass'
import { PricingForm } from '@/components/admin/pricing-form'
import { DollarSign, TrendingUp, MapPin } from 'lucide-react'
import { vehicleTierLabels } from '@/lib/admin/labels'

export const dynamic = 'force-dynamic'

export default async function AdminPricingPage() {
  await requireAdminPage()

  const [{ rules, migrationPending }, { zones }] = await Promise.all([
    listPricingRules(),
    listGeofenceZones(),
  ])

  const active = rules.filter((r) => r.is_active).length
  const surgeRules = rules.filter((r) => r.surge_multiplier > 1).length
  const avgSurge = rules.length > 0
    ? (rules.reduce((sum, r) => sum + r.surge_multiplier, 0) / rules.length).toFixed(2)
    : '1.00'

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">pricing_rules</code> غير موجود. طبّق ترحيل الـ40 وحدة.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <DollarSign size={15} />
            <span className="text-[11px]">قواعد نشطة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#102444]">{active}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <TrendingUp size={15} />
            <span className="text-[11px]">قواعد ذروة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{surgeRules}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <MapPin size={15} />
            <span className="text-[11px]">مناطق جغرافية</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-sky-600">{zones.length}</p>
        </GlassPanel>
      </div>

      <PricingForm />

      <GlassCard title="قواعد التسعير الحالية">
        {rules.length === 0 ? (
          <EmptyState>لا قواعد تسعير — استخدم النموذج أعلاه</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>المدينة</th>
                  <th>الفئة</th>
                  <th>مضاعف الذروة</th>
                  <th>تعديل ثابت</th>
                  <th>أولوية</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs text-[#0f172a]">{r.city ?? 'كل المدن'}</td>
                    <td className="text-xs text-[#475d78]">
                      {r.vehicle_tier ? (vehicleTierLabels[r.vehicle_tier] ?? r.vehicle_tier) : 'كل الفئات'}
                    </td>
                    <td>
                      <GlassBadge tone={r.surge_multiplier > 1.5 ? 'warn' : 'neutral'}>
                        {r.surge_multiplier.toFixed(2)}×
                      </GlassBadge>
                    </td>
                    <td className="text-xs text-[#0f172a]">¥{r.flat_adjustment.toFixed(2)}</td>
                    <td className="text-xs text-[#65768d]">{r.priority}</td>
                    <td>
                      <GlassBadge tone={r.is_active ? 'good' : 'neutral'}>
                        {r.is_active ? 'نشط' : 'موقوف'}
                      </GlassBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Geofence zones */}
      <GlassCard title="مناطق التحديد الجغرافي">
        {zones.length === 0 ? (
          <EmptyState>لا مناطق معرّفة</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>المدينة</th>
                  <th>المنطقة</th>
                  <th>سعر الأساس</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td className="text-xs font-medium text-[#102444]">{z.city_name}</td>
                    <td className="text-xs text-[#475d78]">{z.zone_name}</td>
                    <td className="text-xs text-[#0f172a]">¥{z.base_price.toFixed(2)}</td>
                    <td>
                      <GlassBadge tone={z.is_active ? 'good' : 'neutral'}>
                        {z.is_active ? 'نشط' : 'موقوف'}
                      </GlassBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <p className="admin-footnote">
        التسعير الديناميكي يدعم مضاعف ذروة وتعديل ثابت. القواعد مرتّبة بالأولوية.
        مناطق التحديد الجغرافي تحدّد حدود كل مدينة وسعر الأساس.
      </p>
    </div>
  )
}
