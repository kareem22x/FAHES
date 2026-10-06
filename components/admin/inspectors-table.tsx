'use client'

import { useActionState, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassBadge } from '@/components/admin/ui/glass'
import { DataTable, type Column } from '@/components/admin/ui/data-table'
import { setInspectorStatusAction } from '@/lib/admin/actions'
import { inspectorStatusLabels, type Tone } from '@/lib/admin/labels'
import { maskPhone } from '@/lib/phone'
import type { InspectorRosterRow } from '@/lib/inspector-roster'

/**
 * The roster row type lives in `lib/inspector-roster.ts` alongside the rule that
 * decides membership, so the page and the table cannot drift apart. Re-exported
 * here because this is where the table's consumers already import it from.
 */
export type InspectorRow = InspectorRosterRow

const statusTone: Record<string, Tone> = {
  approved: 'good',
  pending: 'warn',
  rejected: 'bad',
  suspended: 'bad',
  none: 'neutral',
}

function StatusForm({ row }: { row: InspectorRow }) {
  const [state, formAction, pending] = useActionState(setInspectorStatusAction, null)
  const [confirming, setConfirming] = useState(false)

  const decisions: { value: 'approved' | 'rejected' | 'suspended'; label: string; variant: string }[] = [
    { value: 'approved', label: 'اعتماد', variant: 'admin-btn-success' },
    { value: 'rejected', label: 'رفض', variant: 'admin-btn-danger' },
    { value: 'suspended', label: 'إيقاف', variant: 'admin-btn-warn' },
  ]

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={row.id} />
      <div className="flex gap-1">
        {decisions.map((decision) => (
          <button
            key={decision.value}
            type="submit"
            name="status"
            value={decision.value}
            disabled={pending || row.inspectorStatus === decision.value}
            className={cn('admin-btn admin-btn-sm', decision.variant)}
          >
            {decision.label}
          </button>
        ))}
      </div>

      {/*
        Removal is two-step. اعتماد and رفض are reconsiderable — the row stays
        on the roster either way — but إزالة takes the account off it, and a
        single mis-click should not be able to do that.
      */}
      {confirming ? (
        <div className="flex items-center gap-1">
          <button
            type="submit"
            name="status"
            value="none"
            disabled={pending}
            className="admin-btn admin-btn-sm admin-btn-danger"
          >
            تأكيد الإزالة
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="admin-btn admin-btn-sm">
            تراجع
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="إزالة من قائمة الفاحصين وإعادة الحساب إلى عميل"
          className="flex items-center gap-1 self-start text-[10px] text-[#94a3b8] transition-colors hover:text-[#e11d48]"
        >
          <Trash2 size={11} /> إزالة
        </button>
      )}

      {state && (
        <span className={cn('text-[10px]', state.ok ? 'text-[#15803d]' : 'text-[#e11d48]')}>{state.message}</span>
      )}
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
          <span className="truncate font-medium text-[#0f172a]">{row.name}</span>
          <span dir="ltr" className="text-right text-[10px] text-[#94a3b8]">
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
      render: (row) => <span className="text-[#475569]">{experienceLabel(row.experienceYears)}</span>,
    },
    {
      key: 'cities',
      header: 'مدن التغطية',
      sortValue: (row) => row.cities.length,
      exportValue: (row) => row.cities.join(' | '),
      render: (row) => (
        <span className="text-[10px] leading-5 text-[#475569]">
          {row.cities.length > 0 ? row.cities.join('، ') : '—'}
        </span>
      ),
      className: 'max-w-[200px]',
    },
    {
      key: 'specialties',
      header: 'مجالات الفحص',
      render: (row) => (
        <span className="text-[10px] leading-5 text-[#475569]">
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
        <span className="text-[10px] text-[#475569]">
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
      emptyMessage="لا يوجد فاحصون معتمدون بعد."
    />
  )
}
