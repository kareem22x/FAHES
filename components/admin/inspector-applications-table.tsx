'use client'

import { useActionState } from 'react'
import { BadgeCheck, GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassBadge } from '@/components/admin/ui/glass'
import { DataTable, type Column } from '@/components/admin/ui/data-table'
import { setInspectorStatusAction } from '@/lib/admin/actions'
import { inspectorStatusLabels, type Tone } from '@/lib/admin/labels'

/**
 * One row of the inspector-applications inbox.
 *
 * Flattened at the page boundary (`app/(admin)/admin/(console)/inspector-applications/page.tsx`)
 * from an application joined to its account, so this component stays presentational
 * and knows nothing about Supabase.
 */
export type InspectorApplicationRowView = {
  id: string
  userId: string
  /** The name the applicant typed — may differ from the account name. */
  fullName: string
  accountName: string
  nationalId: string | null
  phone: string | null
  age: number | null
  experienceYears: number
  experienceDetails: string
  hasCertificates: boolean | null
  qualification: string
  cities: string[]
  specialties: string[]
  availability: string
  hasEquipment: boolean
  notes: string
  submittedAt: string
  inspectorStatus: string
}

const statusTone: Record<string, Tone> = {
  approved: 'good',
  pending: 'warn',
  rejected: 'bad',
  suspended: 'bad',
  none: 'neutral',
}

/**
 * Gregorian, Latin digits, Arabic month names.
 *
 * The default `ar-SA` locale resolves to the Umm al-Qura calendar, which would
 * show the operator a different year than the one the audit log records.
 */
const submittedFormat = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  dateStyle: 'medium',
})

function formatSubmitted(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : submittedFormat.format(date)
}

function experienceLabel(years: number): string {
  if (years === 0) return 'أقل من سنة'
  if (years >= 31) return 'أكثر من 30 سنة'
  return `${years} سنة`
}

function certificatesLabel(row: InspectorApplicationRowView): string {
  if (row.hasCertificates === null) return 'لم يُجب'
  if (!row.hasCertificates) return 'لا توجد'
  return row.qualification || 'نعم — بدون تفاصيل'
}

function DecisionForm({ row }: { row: InspectorApplicationRowView }) {
  const [state, formAction, pending] = useActionState(setInspectorStatusAction, null)

  const actions = [
    { value: 'approved', label: 'اعتماد', variant: 'admin-btn-success' },
    { value: 'rejected', label: 'رفض', variant: 'admin-btn-danger' },
    { value: 'suspended', label: 'إيقاف', variant: 'admin-btn-warn' },
  ] as const

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={row.userId} />
      <div className="flex gap-1">
        {actions.map((action) => (
          <button
            key={action.value}
            type="submit"
            name="status"
            value={action.value}
            disabled={pending || row.inspectorStatus === action.value}
            className={cn('admin-btn admin-btn-sm', action.variant)}
          >
            {action.label}
          </button>
        ))}
      </div>
      {state && (
        <span className={cn('text-[10px]', state.ok ? 'text-[#15803d]' : 'text-[#e11d48]')}>
          {state.message}
        </span>
      )}
    </form>
  )
}

/**
 * The inspector-applications inbox.
 *
 * Deliberately its own table rather than a filter over `InspectorsTable`: that
 * page lists *accounts* (approved, suspended, and applicants alike) and answers
 * "who is an inspector". This one lists *submissions* and answers "who is
 * waiting for a decision" — a different question, a different sort order, and
 * the only one that shows the identity fields an operator reviews.
 *
 * The national ID and phone are shown in full because verifying them is the
 * point of the review. The page sits behind the admin guard and the phone gate,
 * and every decision is written to the audit log.
 */
export function InspectorApplicationsTable({ rows }: { rows: InspectorApplicationRowView[] }) {
  const columns: Column<InspectorApplicationRowView>[] = [
    {
      key: 'applicant',
      header: 'المتقدم',
      sortValue: (row) => row.fullName,
      searchValue: (row) => `${row.fullName} ${row.accountName} ${row.phone ?? ''} ${row.nationalId ?? ''}`,
      exportValue: (row) => row.fullName,
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-[#0f172a]">{row.fullName}</span>
          {row.accountName && row.accountName !== row.fullName && (
            <span className="truncate text-[10px] text-[#94a3b8]">الحساب: {row.accountName}</span>
          )}
        </div>
      ),
    },
    {
      key: 'nationalId',
      header: 'رقم الهوية',
      sortValue: (row) => row.nationalId,
      exportValue: (row) => row.nationalId ?? '',
      render: (row) => (
        <span dir="ltr" className="font-mono text-[11px] text-[#475569]">
          {row.nationalId ?? '—'}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'الجوال',
      sortValue: (row) => row.phone,
      exportValue: (row) => row.phone ?? '',
      render: (row) => (
        <span dir="ltr" className="font-mono text-[11px] text-[#475569]">
          {row.phone ?? '—'}
        </span>
      ),
    },
    {
      key: 'age',
      header: 'العمر',
      sortValue: (row) => row.age ?? -1,
      exportValue: (row) => row.age ?? '',
      render: (row) => <span className="text-[#475569]">{row.age ?? '—'}</span>,
    },
    {
      key: 'experience',
      header: 'الخبرة',
      sortValue: (row) => row.experienceYears,
      exportValue: (row) => experienceLabel(row.experienceYears),
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-[#475569]">{experienceLabel(row.experienceYears)}</span>
          {row.experienceDetails && (
            <span className="line-clamp-2 max-w-[220px] text-[10px] leading-5 text-[#94a3b8]">
              {row.experienceDetails}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'certificates',
      header: 'الشهادات',
      sortValue: (row) => certificatesLabel(row),
      exportValue: (row) => certificatesLabel(row),
      render: (row) => (
        <span className="flex items-center gap-1.5 text-[10px] leading-5 text-[#475569]">
          {row.hasCertificates && <GraduationCap size={12} className="shrink-0 text-[#0873d1]" />}
          {certificatesLabel(row)}
        </span>
      ),
      className: 'max-w-[180px]',
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
      key: 'submitted',
      header: 'تاريخ التقديم',
      sortValue: (row) => row.submittedAt,
      exportValue: (row) => row.submittedAt,
      render: (row) => <span className="text-[11px] text-[#475569]">{formatSubmitted(row.submittedAt)}</span>,
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
      key: 'actions',
      header: 'القرار',
      render: (row) => <DecisionForm row={row} />,
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      pageSize={20}
      exportName="inspector-applications"
      searchPlaceholder="بحث بالاسم أو الهوية أو الجوال أو المدينة…"
      emptyMessage={
        <span className="flex flex-col items-center gap-2 py-6 text-center">
          <BadgeCheck size={22} className="text-[#94a3b8]" />
          لا توجد طلبات تقديم كفاحص بعد.
        </span>
      }
    />
  )
}
