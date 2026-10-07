import { requireAdminPage } from '@/lib/admin/rbac'
import { listInspectorLocations } from '@/lib/admin/extended-store'
import { GlassPanel, Notice } from '@/components/admin/ui/glass'
import { InspectorMapClient } from '@/components/admin/inspector-map-client'
import { Navigation, MapPin, TriangleAlert, Satellite } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Live inspector positions.
 *
 * The map itself is a client component and owns its own toolbar, legend and
 * roster, because all three are views of one selection: picking a name has to
 * move the map, and clicking a pin has to highlight the name. Splitting them
 * across the server/client boundary would mean lifting that selection back into
 * the page and re-rendering the whole console on every click.
 *
 * What stays here is what the server knows and the client does not: who is
 * allowed to look, and whether the table this page depends on exists at all.
 */
export default async function AdminInspectorMapPage() {
  await requireAdminPage()

  const { locations, migrationPending } = await listInspectorLocations()

  const onlineCount = locations.filter((location) => location.status !== 'offline').length
  const inspectingCount = locations.filter((location) => location.status === 'inspecting').length
  const mockGpsCount = locations.filter((location) => location.is_mock_location).length

  const kpis = [
    { icon: Navigation, label: 'فاحصون متصلون', value: onlineCount, className: 'text-[#102444]' },
    { icon: MapPin, label: 'يفحص الآن', value: inspectingCount, className: 'text-emerald-600' },
    { icon: TriangleAlert, label: 'مواقع مزيفة', value: mockGpsCount, className: 'text-rose-600' },
    { icon: Satellite, label: 'إجمالي على الخريطة', value: locations.length, className: 'text-[#102444]' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">inspector_locations</code> غير موجود في قاعدة البيانات. طبّق ملف
          المخطط الكامل <code className="admin-code">supabase/FAHES_FULL_SCHEMA.sql</code> من محرر SQL، وستعمل
          الخريطة فورًا.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <GlassPanel key={kpi.label} className="p-4">
            <div className="flex items-center gap-2 text-[#65768d]">
              <kpi.icon size={15} />
              <span className="text-[11px]">{kpi.label}</span>
            </div>
            <p className={`mt-2 text-2xl font-semibold ${kpi.className}`}>{kpi.value}</p>
          </GlassPanel>
        ))}
      </div>

      <InspectorMapClient locations={locations} />

      <p className="admin-footnote">
        تُحدَّث المواقع عبر <code className="admin-code">/api/inspector/field/location</code> من واجهة الميدان،
        وتُثبَّت في القاعدة بدالة <code className="admin-code">upsert_inspector_location</code>. اكتشاف الموقع
        المزيّف آلي ويُنشئ مخالفة في جدول <code className="admin-code">inspector_violations</code>.
      </p>
    </div>
  )
}
