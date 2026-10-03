'use client'

import { useActionState } from 'react'
import { cn } from '@/lib/utils'
import { GlassBadge } from '@/components/admin/ui/glass'
import { DataTable, type Column } from '@/components/admin/ui/data-table'
import { setInspectorStatusAction } from '@/lib/admin/actions'
import { inspectorStatusLabels, type Tone } from '@/lib/admin/labels'
import { maskPhone } from '@/lib/phone'

export type InspectorRow = {
  id: string
  name: string
  phone: string | null
  role: string
  inspectorStatus: string
  experienceYears: number | null
  availability: string | null
  cities: string[]
  specialties: string[]
  qualification: string | null
  hasEquipment: boolean | null
  notes: string | null
  hasApplication: boolean
}

const statusTone: Record<string, Tone> = {
  approved: 'good',
  pending: 'warn',
  rejected: 'bad',
  suspended: 'bad',
  none: 'neutral',
}

function StatusForm({ row }: { row: InspectorRow }) {
  const [state, formAction, pending] = useActionState(setInspectorStatusAction, null)

  const actions: { value: 'approved' | 'rejected' | 'suspended'; label: string; variant: string }[] = [
    { value: 'approved', label: 'اعتماد', variant: 'hover:bg-emerald-400/10 hover:text-emerald-300' },
    { value: 'rejected', label: 'رفض', variant: 'hover:bg-rose-400/10 hover:text-rose-300' },
    { value: 'suspended', label: 'إيقاف', variant: 'hover:bg-amber-400/10 hover:text-amber-300' },
  ]

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={row.id} />
      <div className="flex gap-1">
        {actions.map((action) => (
          <button
            key={action.value}
            type="submit"
            name="status"
            value={action.value}
            disabled={pending || row.inspectorStatus === action.value}
            className={cn(
              'rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-neutral-400 transition-colors disabled:opacity-40',
              action.variant,
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
      {state && <span className={cn('text-[10px]', state.ok ? 'text-emerald-400' : 'text-rose-400')}>{state.message}</span>}
    </form>
  )
}

function experienceLabel(years: number | null) {
  if (years === null) return '—'
  if (years === 0) return 'أقل من سنة'
  if (years >= 31) return 'أكثر من 30 سنة'
  return `${years} سنة`
}

export function InspectorsTable({ rows }: { rows: InspectorRow[] }) {
  const columns: Column<InspectorRow>[] = [
    {
      key: 'name',
      header: 'الفاحص',
      sortValue: (row) => row.name,
      searchValue: (row) => `${row.name} ${row.phone ?? ''} ${row.cities.join(' ')} ${row.specialties.join(' ')}`,
      exportValue: (row) => row.name,
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-neutral-100">{row.name}</span>
          <span dir="ltr" className="text-right text-[10px] text-neutral-600">
            {maskPhone(row.phone)}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      sortValue: (row) => inspectorStatusLabels[row.inspectorStatus] ?? row.inspectorStatus,
      exportValue: (row) => row.inspectorStatus,
      render: (row) => (
        <GlassBadge tone={statusTone[row.inspectorStatus] ?? 'neutral'}>
          {inspectorStatusLabels[row.inspectorStatus] ?? row.inspectorStatus}
        </GlassBadge>
      ),
    },
    {
      key: 'experience',
      header: 'الخبرة',
      sortValue: (row) => row.experienceYears ?? -1,
      exportValue: (row) => row.experienceYears ?? '',
      render: (row) => <span className="text-neutral-400">{experienceLabel(row.experienceYears)}</span>,
    },
    {
      key: 'cities',
      header: 'مدن التغطية',
      sortValue: (row) => row.cities.length,
      exportValue: (row) => row.cities.join(' | '),
      render: (row) => (
        <span className="text-[10px] leading-5 text-neutral-400">{row.cities.length > 0 ? row.cities.join('، ') : '—'}</span>
      ),
      className: 'max-w-[200px]',
    },
    {
      key: 'specialties',
      header: 'مجالات الفحص',
      render: (row) => (
        <span className="text-[10px] leading-5 text-neutral-400">
          {row.specialties.length > 0 ? row.specialties.join('، ') : '—'}
        </span>
      ),
      className: 'max-w-[220px]',
    },
    {
      key: 'equipment',
      header: 'معدات',
      sortValue: (row) => (row.hasEquipment ? 1 : 0),
      exportValue: (row) => (row.hasEquipment === null ? '' : row.hasEquipment ? 'متوفرة' : 'غير متوفرة'),
      render: (row) => (
        <span className="text-[10px] text-neutral-400">
          {row.hasEquipment === null ? '—' : row.hasEquipment ? 'متوفرة' : 'غير متوفرة'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'إجراءات',
      render: (row) => <StatusForm row={row} />,
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      pageSize={20}
      exportName="inspectors"
      searchPlaceholder="بحث بالاسم أو المدينة أو المجال…"
      emptyMessage="لا توجد طلبات فاحصين."
    />
  )
}
