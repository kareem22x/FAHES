'use client'

import { useActionState, useState } from 'react'
import { Check, Flag, MessageSquarePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassBadge, GlassButton } from '@/components/admin/ui/glass'
import { DataTable, type Column } from '@/components/admin/ui/data-table'
import { addInspectionNoteAction, cancelInspectionAction, reviewInspectionAction } from '@/lib/admin/actions'
import { reviewDecisionLabels, reviewDecisionTone, type ReviewDecision } from '@/lib/admin/labels'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'
import type { Tone } from '@/lib/admin/labels'

/** Plain, serializable shape — server pages pass data, not React nodes. */
export type InspectionRow = {
  id: string
  vehicle: string
  year: number
  city: string
  district: string
  status: string
  statusLabel: string
  statusTone: Tone
  customerName: string
  inspectorName: string | null
  services: string
  offersCount: number
  pendingOffers: number
  acceptedPrice: number | null
  scheduledAt: string
  createdAt: number
  cancellable: boolean
  decision: ReviewDecision | null
  note: string
}

function RowActions({ row }: { row: InspectionRow }) {
  const [reviewState, reviewAction, reviewPending] = useActionState(reviewInspectionAction, null)
  const [noteState, noteAction, notePending] = useActionState(addInspectionNoteAction, null)
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelInspectionAction, null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const message = reviewState ?? noteState ?? cancelState

  return (
    <div className="flex flex-col items-start gap-1.5">
      <form action={reviewAction} className="flex gap-1">
        <input type="hidden" name="inspectionId" value={row.id} />
        <button
          type="submit"
          name="decision"
          value="approved"
          disabled={reviewPending}
          title="اعتماد"
          className={cn(
            'rounded-md border px-1.5 py-1 transition-colors disabled:opacity-50',
            row.decision === 'approved'
              ? 'border-emerald-400/40 bg-emerald-400/20 text-emerald-200'
              : 'border-white/10 bg-white/5 text-neutral-400 hover:bg-emerald-400/10 hover:text-emerald-300',
          )}
        >
          <Check className="size-3" />
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={reviewPending}
          title="رفض"
          className={cn(
            'rounded-md border px-1.5 py-1 transition-colors disabled:opacity-50',
            row.decision === 'rejected'
              ? 'border-rose-400/40 bg-rose-400/20 text-rose-200'
              : 'border-white/10 bg-white/5 text-neutral-400 hover:bg-rose-400/10 hover:text-rose-300',
          )}
        >
          <X className="size-3" />
        </button>
        <button
          type="submit"
          name="decision"
          value="flagged"
          disabled={reviewPending}
          title="تعليم للمراجعة"
          className={cn(
            'rounded-md border px-1.5 py-1 transition-colors disabled:opacity-50',
            row.decision === 'flagged'
              ? 'border-amber-400/40 bg-amber-400/20 text-amber-200'
              : 'border-white/10 bg-white/5 text-neutral-400 hover:bg-amber-400/10 hover:text-amber-300',
          )}
        >
          <Flag className="size-3" />
        </button>
      </form>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setNoteOpen((current) => !current)}
          className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300"
        >
          <MessageSquarePlus className="size-3" /> ملاحظة
        </button>
        {row.cancellable &&
          (confirmCancel ? (
            <form action={cancelAction} className="flex items-center gap-1">
              <input type="hidden" name="inspectionId" value={row.id} />
              <button
                type="submit"
                disabled={cancelPending}
                className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-medium text-rose-200 disabled:opacity-50"
              >
                {cancelPending ? '…' : 'تأكيد الإلغاء'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="text-[10px] text-neutral-500 hover:text-neutral-300"
              >
                تراجع
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="text-[10px] text-rose-400/70 hover:text-rose-300"
            >
              إلغاء الطلب
            </button>
          ))}
      </div>

      {noteOpen && (
        <form action={noteAction} className="flex w-full items-center gap-1">
          <input type="hidden" name="inspectionId" value={row.id} />
          <input
            name="note"
            defaultValue={row.note}
            placeholder="ملاحظة إدارية…"
            className="w-40 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-sky-400/50"
          />
          <GlassButton size="sm" type="submit" disabled={notePending}>
            حفظ
          </GlassButton>
        </form>
      )}

      {message && <span className={cn('text-[10px]', message.ok ? 'text-emerald-400' : 'text-rose-400')}>{message.message}</span>}
    </div>
  )
}

export function InspectionsTable({ rows }: { rows: InspectionRow[] }) {
  const columns: Column<InspectionRow>[] = [
    {
      key: 'inspection',
      header: 'الطلب',
      sortValue: (row) => row.createdAt,
      searchValue: (row) => `${row.id} ${row.vehicle} ${row.city} ${row.customerName} ${row.inspectorName ?? ''}`,
      exportValue: (row) => row.id,
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-neutral-100">
            {row.vehicle} <span className="text-[10px] font-normal text-neutral-500">{row.year}</span>
          </span>
          <span dir="ltr" className="truncate text-right text-[10px] text-neutral-600">
            {row.id}
          </span>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'العميل',
      sortValue: (row) => row.customerName,
      exportValue: (row) => row.customerName,
      render: (row) => <span className="text-neutral-300">{row.customerName}</span>,
    },
    {
      key: 'city',
      header: 'الموقع',
      sortValue: (row) => row.city,
      exportValue: (row) => `${row.city} - ${row.district}`,
      render: (row) => (
        <span className="text-neutral-400">
          {row.city}
          <span className="block text-[10px] text-neutral-600">{row.district}</span>
        </span>
      ),
    },
    {
      key: 'inspector',
      header: 'الفاحص',
      sortValue: (row) => row.inspectorName ?? '',
      exportValue: (row) => row.inspectorName ?? '',
      render: (row) => <span className="text-neutral-400">{row.inspectorName ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      sortValue: (row) => row.statusLabel,
      exportValue: (row) => row.status,
      render: (row) => <GlassBadge tone={row.statusTone}>{row.statusLabel}</GlassBadge>,
    },
    {
      key: 'offers',
      header: 'العروض',
      align: 'end',
      sortValue: (row) => row.offersCount,
      exportValue: (row) => row.offersCount,
      render: (row) => (
        <span className="text-neutral-300">
          {formatArabicNumber(row.offersCount)}
          {row.pendingOffers > 0 && <span className="mr-1 text-[10px] text-amber-400">({row.pendingOffers})</span>}
          {row.acceptedPrice !== null && (
            <span className="block text-[10px] text-neutral-500">{formatArabicNumber(row.acceptedPrice)} ر.س</span>
          )}
        </span>
      ),
    },
    {
      key: 'review',
      header: 'المراجعة',
      sortValue: (row) => (row.decision ? reviewDecisionLabels[row.decision] : ''),
      exportValue: (row) => row.decision ?? '',
      render: (row) => (
        <div className="flex flex-col gap-1">
          {row.decision ? (
            <GlassBadge tone={reviewDecisionTone[row.decision]}>{reviewDecisionLabels[row.decision]}</GlassBadge>
          ) : (
            <span className="text-[10px] text-neutral-600">لم تُراجَع</span>
          )}
          {row.note && <span className="max-w-[160px] text-[10px] leading-4 text-neutral-500">{row.note}</span>}
        </div>
      ),
    },
    {
      key: 'scheduled',
      header: 'الموعد',
      align: 'end',
      sortValue: (row) => Date.parse(row.scheduledAt),
      exportValue: (row) => row.scheduledAt,
      render: (row) => (
        <time dir="ltr" className="text-[10px] text-neutral-500">
          {formatArabicDate(row.scheduledAt)}
        </time>
      ),
    },
    {
      key: 'actions',
      header: 'إجراءات',
      render: (row) => <RowActions row={row} />,
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      pageSize={20}
      exportName="inspections"
      searchPlaceholder="بحث بالطلب أو العميل أو المدينة…"
      emptyMessage="لا توجد طلبات مطابقة."
    />
  )
}
