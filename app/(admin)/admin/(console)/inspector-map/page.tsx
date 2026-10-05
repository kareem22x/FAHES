import { requireAdminPage } from '@/lib/admin/rbac'
import { listInspectorLocations } from '@/lib/admin/extended-store'
import { GlassPanel, GlassCard, GlassBadge, EmptyState, Notice, StatusDot } from '@/components/admin/ui/glass'
import { inspectorLocationStatusLabels, inspectorLocationStatusTone } from '@/lib/admin/labels'
import { InspectorMapClient } from '@/components/admin/inspector-map-client'
import { MapPin, Battery, AlertTriangle, Navigation } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminInspectorMapPage() {
  await requireAdminPage()

  const { locations, migrationPending } = await listInspectorLocations()

  const onlineCount = locations.filter((l) => l.status !== 'offline').length
  const inspectingCount = locations.filter((l) => l.status === 'inspecting').length
  const mockGpsCount = locations.filter((l) => l.is_mock_location).length

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">inspector_locations</code> غير موجود في قاعدة البيانات.
          طبّق ترحيل الـ40 وحدة عبر لوحة Supabase أو زوّد PAT لتطبيقه آليًا.
        </Notice>
      )}

      {/* Status KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Navigation size={15} />
            <span className="text-[11px]">فاحصون متصلون</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#102444]">{onlineCount}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <MapPin size={15} />
            <span className="text-[11px]">يفحص الآن</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{inspectingCount}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <AlertTriangle size={15} />
            <span className="text-[11px]">مواقع مزيفة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-rose-600">{mockGpsCount}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Battery size={15} />
            <span className="text-[11px]">إجمالي على الخريطة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#102444]">{locations.length}</p>
        </GlassPanel>
      </div>

      {/* Map placeholder + live table */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <GlassCard title="خريطة المواقع اللحظية" className="lg:col-span-3" bodyClassName="min-h-[300px]">
          {locations.length === 0 ? (
            <EmptyState>لا فاحصين متصلين حاليًا</EmptyState>
          ) : (
            <InspectorMapClient locations={locations} />
          )}
        </GlassCard>

        <GlassCard title="قائمة الفاحصين" className="lg:col-span-2" bodyClassName="max-h-[400px] overflow-y-auto">
          {locations.length === 0 ? (
            <EmptyState>لا مواقع</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {locations.map((loc) => (
                <div key={loc.id} className="flex items-center gap-3 rounded-lg border border-[#e3eaf2] bg-slate-50/50 px-3 py-2.5">
                  <StatusDot
                    tone={inspectorLocationStatusTone[loc.status] ?? 'neutral'}
                    pulse={loc.status === 'inspecting'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[#102444]">{loc.inspector_name}</p>
                    <p className="text-[10px] text-[#65768d]">
                      {inspectorLocationStatusLabels[loc.status] ?? loc.status}
                      {loc.battery_level != null && ` · بطارية ${loc.battery_level}%`}
                    </p>
                  </div>
                  {loc.is_mock_location && (
                    <GlassBadge tone="bad">موقع مزيف</GlassBadge>
                  )}
                  <span className="text-[10px] text-[#94a3b8]">
                    {loc.latitude.toFixed(4)}، {loc.longitude.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      <p className="admin-footnote">
        تُحدَّث المواقع عبر دالة <code className="admin-code">upsert_inspector_location</code> من تطبيق الفاحص.
        اكتشاف الموقع المزيّف آلي ويُنشئ مخالفة في جدول <code className="admin-code">inspector_violations</code>.
      </p>
    </div>
  )
}
