'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Crown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassBadge, GlassButton } from '@/components/admin/ui/glass'
import { DataTable, type Column } from '@/components/admin/ui/data-table'
import { bulkSetUserRoleAction, setUserRoleAction } from '@/lib/admin/actions'
import { inspectorStatusLabels, roleBadgeClasses, roleLabels } from '@/lib/admin/labels'
import { formatArabicDate, formatArabicNumber } from '@/lib/inspection-status'
import { maskPhone } from '@/lib/phone'
import type { UserRow } from '@/lib/admin/store'

const ROLE_OPTIONS = ['customer', 'inspector', 'admin'] as const
type AssignableRole = (typeof ROLE_OPTIONS)[number]

const roleShort: Record<AssignableRole, string> = {
  customer: 'عميل',
  inspector: 'فاحص',
  admin: 'مدير',
}

/** Per-row role switcher. Its own action state so rows report independently. */
function UserRoleForm({
  userId,
  role,
  canEdit,
  lockedReason,
}: {
  userId: string
  role: AssignableRole
  canEdit: boolean
  lockedReason?: string
}) {
  const [state, formAction, pending] = useActionState(setUserRoleAction, null)

  if (!canEdit) {
    return <span className="text-[10px] text-neutral-600">{lockedReason ?? 'غير قابل للتعديل'}</span>
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex gap-1">
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option}
            type="submit"
            name="role"
            value={option}
            disabled={option === role || pending}
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-default',
              option === role
                ? 'bg-white text-neutral-950'
                : 'border border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-neutral-100 disabled:opacity-40',
            )}
          >
            {roleShort[option]}
          </button>
        ))}
      </div>
      {state && !state.ok && <span className="text-[10px] text-rose-400">{state.message}</span>}
      {state?.ok && <span className="text-[10px] text-emerald-400">{state.message}</span>}
    </form>
  )
}

export function UsersTable({
  rows,
  isOwner,
  currentUserId,
  ownerIds,
}: {
  rows: UserRow[]
  isOwner: boolean
  currentUserId: string
  ownerIds: string[]
}) {
  const [bulkState, bulkAction, bulkPending] = useActionState(bulkSetUserRoleAction, null)
  const ownerSet = new Set(ownerIds)

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'الحساب',
      sortValue: (row) => row.name,
      searchValue: (row) => `${row.name} ${row.phone ?? ''} ${row.id}`,
      exportValue: (row) => row.name,
      render: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 truncate font-medium text-neutral-100">
            {row.name}
            {ownerSet.has(row.id) && (
              <GlassBadge tone="warn">
                <Crown className="size-2.5" /> مالك
              </GlassBadge>
            )}
          </span>
          <span dir="ltr" className="truncate text-right text-[10px] text-neutral-600">
            {row.id.slice(0, 8)}…
          </span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'الجوال',
      sortValue: (row) => row.phone ?? '',
      exportValue: (row) => row.phone ?? '',
      render: (row) => (
        <span dir="ltr" className="text-neutral-400">
          {maskPhone(row.phone)}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'الدور',
      sortValue: (row) => roleLabels[row.role] ?? row.role,
      exportValue: (row) => row.role,
      render: (row) => (
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', roleBadgeClasses[row.role])}>
          {roleLabels[row.role] ?? row.role}
        </span>
      ),
    },
    {
      key: 'inspectorStatus',
      header: 'حالة الفاحص',
      sortValue: (row) => inspectorStatusLabels[row.inspectorStatus] ?? row.inspectorStatus,
      exportValue: (row) => row.inspectorStatus,
      render: (row) => <span className="text-neutral-400">{inspectorStatusLabels[row.inspectorStatus] ?? '—'}</span>,
    },
    {
      key: 'inspections',
      header: 'الطلبات',
      align: 'end',
      sortValue: (row) => row.inspectionCount,
      exportValue: (row) => row.inspectionCount,
      render: (row) => <span className="text-neutral-300">{formatArabicNumber(row.inspectionCount)}</span>,
    },
    {
      key: 'lastLogin',
      header: 'آخر دخول',
      align: 'end',
      sortValue: (row) => row.lastLoginAt,
      exportValue: (row) => new Date(row.lastLoginAt).toISOString(),
      render: (row) => (
        <time dir="ltr" className="text-[10px] text-neutral-500">
          {formatArabicDate(row.lastLoginAt)}
        </time>
      ),
    },
    {
      key: 'actions',
      header: 'تغيير الدور',
      render: (row) => {
        const isOwnerAccount = ownerSet.has(row.id)
        const isSelf = row.id === currentUserId
        // Owner accounts are untouchable; nobody edits their own role; and
        // touching an admin (including promoting to admin) is owner-only.
        const canEdit = !isOwnerAccount && !isSelf && (row.role === 'admin' ? isOwner : true)
        return (
          <UserRoleForm
            userId={row.id}
            role={row.role as AssignableRole}
            canEdit={canEdit}
            lockedReason={
              isOwnerAccount ? 'حساب مالك محمي' : isSelf ? 'حسابك الحالي' : row.role === 'admin' ? 'للمالك فقط' : undefined
            }
          />
        )
      },
    },
    {
      key: 'open',
      header: '',
      render: (row) => (
        <Link
          href={`/admin/users/${row.id}`}
          className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300"
        >
          <ExternalLink className="size-3" /> عرض
        </Link>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        rows={rows}
        columns={columns}
        selectable
        pageSize={20}
        exportName="users"
        searchPlaceholder="بحث بالاسم أو الجوال أو المعرّف…"
        emptyMessage="لا نتائج مطابقة."
        renderBulkBar={(selectedIds, clear) => (
          <form action={bulkAction} className="flex flex-wrap items-center gap-1">
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <span className="text-[11px] text-neutral-500">تعيين الدور:</span>
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option}
                type="submit"
                name="role"
                value={option}
                disabled={bulkPending}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                {roleShort[option]}
              </button>
            ))}
            <button type="button" onClick={clear} className="text-[10px] text-neutral-500 hover:text-neutral-300">
              مسح التحديد
            </button>
          </form>
        )}
      />
      {bulkState && (
        <p className={cn('text-[11px]', bulkState.ok ? 'text-emerald-400' : 'text-rose-400')}>{bulkState.message}</p>
      )}
      <p className="text-[10px] leading-5 text-neutral-600">
        قواعد الحماية: لا يمكنك تغيير دور حسابك، وحسابات المالك محميّة، ومنح أو سحب صلاحية «مدير» للمالك فقط،
        ولا يمكن إزالة آخر مدير. كل محاولة — ناجحة أو مرفوضة — تُسجَّل في سجل التدقيق.
      </p>
    </div>
  )
}
