import Link from 'next/link'
import { cn } from '@/lib/utils'
import { InspectionsTable, type InspectionRow } from '@/components/admin/inspections-table'
import { requireAdminPage } from '@/lib/admin/rbac'
import { inspectionStatusFilters, listAllInspections, listInspectionAnnotations, type InspectionStatus } from '@/lib/admin/store'
import { isActiveStatus, statusOf } from '@/lib/inspection-status'
import { listUsers } from '@/lib/user-store'
import type { Tone } from '@/lib/admin/labels'

export const dynamic = 'force-dynamic'

const validStatuses: InspectionStatus[] = [
  'open',
  'assigned',
  'on_the_way',
  'arrived',
  'inspecting',
  'completed',
  'cancelled',
]

const toneMap: Record<'open' | 'progress' | 'done' | 'cancelled', Tone> = {
  open: 'warn',
  progress: 'neutral',
  done: 'good',
  cancelled: 'bad',
}

export default async function AdminInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  await requireAdminPage()
  const params = await searchParams
  const status = validStatuses.includes(params.status as InspectionStatus)
    ? (params.status as InspectionStatus)
    : undefined

  const [inspections, annotations, users] = await Promise.all([
    listAllInspections(status),
    listInspectionAnnotations(),
    listUsers(),
  ])
  const nameById = new Map(users.map((user) => [user.id, user.name]))

  const rows: InspectionRow[] = inspections.map((inspection) => {
    const meta = statusOf(inspection.status)
    const accepted = inspection.offers.find((offer) => offer.status === 'accepted')
    const annotation = annotations.get(inspection.id)
    return {
      id: inspection.id,
      vehicle: `${inspection.vehicle.make} ${inspection.vehicle.model}`,
      year: inspection.vehicle.year,
      city: inspection.city,
      district: inspection.district,
      status: inspection.status,
      statusLabel: meta.label,
      statusTone: toneMap[meta.tone],
      customerName: nameById.get(inspection.customerId) ?? '—',
      inspectorName: inspection.assignedInspectorId ? (nameById.get(inspection.assignedInspectorId) ?? '—') : null,
      services: inspection.services.join('، '),
      offersCount: inspection.offers.length,
      pendingOffers: inspection.offers.filter((offer) => offer.status === 'pending').length,
      acceptedPrice: accepted ? accepted.price : null,
      scheduledAt: inspection.scheduledAt,
      createdAt: inspection.createdAt,
      cancellable: isActiveStatus(inspection.status),
      decision: annotation?.decision ?? null,
      note: annotation?.note ?? '',
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="admin-filter-pills">
        {inspectionStatusFilters.map((filter) => {
          const isActive = (filter.value === 'all' && !status) || filter.value === status
          return (
            <Link
              key={filter.value}
              href={filter.value === 'all' ? '/admin/inspections' : `/admin/inspections?status=${filter.value}`}
              className={cn('admin-filter-pill', isActive && 'is-active')}
            >
              {filter.label}
            </Link>
          )
        })}
      </div>

      <InspectionsTable rows={rows} />

      <p className="admin-footnote">
        قرارات المراجعة والملاحظات الإدارية تُخزَّن كأحداث تدقيق <code>append-only</code> لا كمُعرّفات قابلة
        للتعديل — فيبقى سجل من غيّر القرار ومتى. الإلغاء متاح للطلبات النشطة فقط، ويرفض العروض المعلّقة معه.
      </p>
    </div>
  )
}
