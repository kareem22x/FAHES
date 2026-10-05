import { requireAdminPage } from '@/lib/admin/rbac'
import { listShowrooms, type Showroom } from '@/lib/admin/extended-store'
import { GlassPanel, GlassCard, GlassBadge, EmptyState, Notice } from '@/components/admin/ui/glass'
import { ShowroomForm } from '@/components/admin/showroom-form'
import { Store, Handshake, MapPin, Phone } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminShowroomsPage() {
  await requireAdminPage()

  const { showrooms, migrationPending } = await listShowrooms()

  const active = showrooms.filter((s) => s.is_active).length
  const partners = showrooms.filter((s) => s.is_partner).length
  const totalInspections = showrooms.reduce((sum, s) => sum + s.total_inspections, 0)

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">showrooms</code> غير موجود. طبّق ترحيل الـ40 وحدة.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Store size={15} />
            <span className="text-[11px]">إجمالي المعارض</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#102444]">{showrooms.length}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Handshake size={15} />
            <span className="text-[11px]">شركاء</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{partners}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <Store size={15} />
            <span className="text-[11px]">نشطة</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-sky-600">{active}</p>
        </GlassPanel>
        <GlassPanel className="p-4">
          <div className="flex items-center gap-2 text-[#65768d]">
            <MapPin size={15} />
            <span className="text-[11px]">فحوصات إجمالية</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-[#102444]">{totalInspections}</p>
        </GlassPanel>
      </div>

      <ShowroomForm />

      <GlassCard title="شبكة المعارض">
        {showrooms.length === 0 ? (
          <EmptyState>لا معارض مسجّلة</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>المعرض</th>
                  <th>المدينة</th>
                  <th>الحي</th>
                  <th>الهاتف</th>
                  <th>جهة الاتصال</th>
                  <th>الفحوصات</th>
                  <th>دورة الفحص</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {showrooms.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium text-[#102444]">{s.name}</div>
                      {s.is_partner && (
                        <span className="text-[10px] text-emerald-600">شريك</span>
                      )}
                    </td>
                    <td className="text-xs text-[#475d78]">{s.city}</td>
                    <td className="text-xs text-[#65768d]">{s.district}</td>
                    <td className="text-xs text-[#65768d]">{s.phone || '—'}</td>
                    <td className="text-xs text-[#65768d]">{s.contact_person || '—'}</td>
                    <td className="text-xs text-[#0f172a]">{s.total_inspections}</td>
                    <td className="text-xs text-[#65768d]">
                      {s.avg_turnaround_hours != null ? `${s.avg_turnaround_hours.toFixed(1)} ساعة` : '—'}
                    </td>
                    <td>
                      <GlassBadge tone={s.is_active ? 'good' : 'neutral'}>
                        {s.is_active ? 'نشط' : 'موقوف'}
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
        المعارض الشريكة تحصل على أولوية في التوجيه. دورة الفحص تُقاس بالساعات.
      </p>
    </div>
  )
}
