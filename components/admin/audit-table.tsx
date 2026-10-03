'use client'

import { useMemo, useState } from 'react'
import { GlassBadge } from '@/components/admin/ui/glass'
import { DataTable, type Column } from '@/components/admin/ui/data-table'
import { auditEventLabel, auditEventTone } from '@/lib/admin/labels'
import { formatArabicDate } from '@/lib/inspection-status'
import type { AuditEventRow, Json } from '@/lib/supabase/database.types'

/** Renders audit metadata as a short `key: value` line. */
function metadataSummary(metadata: Json): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return ''
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 5)
    .map(([key, value]) => {
      const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value)
      return `${key}: ${rendered.length > 60 ? `${rendered.slice(0, 60)}…` : rendered}`
    })
    .join(' · ')
}

/**
 * Immutable log viewer. The table it reads rejects UPDATE and DELETE at the
 * database level, so this is a record of what happened — not an editable list.
 */
export function AuditTable({
  events,
  nameById,
  types,
}: {
  events: AuditEventRow[]
  nameById: Record<string, string>
  types: string[]
}) {
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [scope, setScope] = useState<'all' | 'admin'>('all')

  const rows = useMemo(
    () =>
      events.filter((event) => {
        if (typeFilter !== 'all' && event.event_type !== typeFilter) return false
        if (scope === 'admin' && !event.event_type.startsWith('admin.')) return false
        return true
      }),
    [events, typeFilter, scope],
  )

  const columns: Column<AuditEventRow>[] = [
    {
      key: 'event',
      header: 'الحدث',
      sortValue: (row) => auditEventLabel(row.event_type),
      searchValue: (row) => `${auditEventLabel(row.event_type)} ${row.event_type}`,
      exportValue: (row) => row.event_type,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <GlassBadge tone={auditEventTone(row.event_type)}>{auditEventLabel(row.event_type)}</GlassBadge>
          <span dir="ltr" className="text-right text-[10px] text-neutral-600">
            {row.event_type}
          </span>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'المنفّذ',
      sortValue: (row) => (row.actor_id ? (nameById[row.actor_id] ?? row.actor_id) : 'النظام'),
      render: (row) => (
        <span className="text-neutral-300">
          {row.actor_id ? (nameById[row.actor_id] ?? <span dir="ltr">{row.actor_id.slice(0, 12)}…</span>) : 'النظام'}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'الهدف',
      sortValue: (row) => row.resource_type,
      render: (row) => (
        <span className="text-neutral-400">
          {row.resource_type}
          {row.resource_id && (
            <span dir="ltr" className="mr-1 block text-[10px] text-neutral-600">
              {row.resource_id.length > 24 ? `${row.resource_id.slice(0, 24)}…` : row.resource_id}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'metadata',
      header: 'تفاصيل',
      render: (row) => (
        <span className="text-[10px] leading-5 text-neutral-500">{metadataSummary(row.metadata) || '—'}</span>
      ),
      className: 'max-w-[280px]',
    },
    {
      key: 'at',
      header: 'الوقت',
      align: 'end',
      sortValue: (row) => Date.parse(row.created_at),
      exportValue: (row) => row.created_at,
      render: (row) => (
        <time dir="ltr" className="text-[10px] text-neutral-500">
          {formatArabicDate(row.created_at)}
        </time>
      ),
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      pageSize={25}
      exportName="audit-logs"
      searchPlaceholder="بحث في السجل…"
      emptyMessage="لا توجد أحداث مطابقة."
      toolbar={
        <div className="flex items-center gap-1">
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as 'all' | 'admin')}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-neutral-300 outline-none focus:border-sky-400/50"
          >
            <option value="all">كل الأحداث</option>
            <option value="admin">الأحداث الإدارية</option>
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="max-w-[180px] rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-neutral-300 outline-none focus:border-sky-400/50"
          >
            <option value="all">كل الأنواع</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {auditEventLabel(type)}
              </option>
            ))}
          </select>
        </div>
      }
    />
  )
}
