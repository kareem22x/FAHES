'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassButton, GlassPanel } from '@/components/admin/ui/glass'

export type Column<T> = {
  key: string
  header: string
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number | null
  /** Text folded into the search box. */
  searchValue?: (row: T) => string
  /** Value written to CSV/JSON exports; falls back to `sortValue`. */
  exportValue?: (row: T) => string | number | null
  render: (row: T) => React.ReactNode
  align?: 'start' | 'end'
  className?: string
}

type SortDirection = 'asc' | 'desc'

/**
 * Dense, dependency-free data table.
 *
 * Sorting, filtering, pagination and selection are all client-side: the admin
 * console loads at most a few hundred rows per view, and doing it here keeps
 * every interaction instant instead of round-tripping. The dataset bounds are
 * enforced by the queries in `lib/admin/store.ts`.
 */
export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  pageSize = 20,
  selectable = false,
  searchable = true,
  searchPlaceholder = 'بحث…',
  exportName,
  emptyMessage = 'لا توجد بيانات',
  renderBulkBar,
  toolbar,
  getRowId,
}: {
  columns: Column<T>[]
  rows: T[]
  pageSize?: number
  selectable?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  exportName?: string
  emptyMessage?: React.ReactNode
  renderBulkBar?: (selectedIds: string[], clear: () => void) => React.ReactNode
  toolbar?: React.ReactNode
  /** Row identity for selection and React keys. Defaults to `String(row.id)`. */
  getRowId?: (row: T) => string
}) {
  const rowId = (row: T) => (getRowId ? getRowId(row) : String(row.id))
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      columns.some((column) => {
        const value = column.searchValue?.(row) ?? column.sortValue?.(row)
        return value != null && String(value).toLowerCase().includes(needle)
      }),
    )
  }, [rows, columns, query])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const column = columns.find((candidate) => candidate.key === sortKey)
    if (!column?.sortValue) return filtered
    const factor = direction === 'asc' ? 1 : -1
    return [...filtered].sort((left, right) => {
      const a = column.sortValue!(left)
      const b = column.sortValue!(right)
      if (a == null && b == null) return 0
      if (a == null) return 1
      if (b == null) return -1
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor
      return String(a).localeCompare(String(b), 'ar') * factor
    })
  }, [filtered, columns, sortKey, direction])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const pageIds = pageRows.map(rowId)
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = pageIds.some((id) => selected.has(id)) && !allOnPageSelected
    }
  }, [pageIds, selected, allOnPageSelected])

  function toggleSort(column: Column<T>) {
    if (!column.sortValue) return
    if (sortKey === column.key) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(column.key)
      setDirection('desc')
    }
    setPage(1)
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllOnPage() {
    setSelected((current) => {
      const next = new Set(current)
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function exportRows(format: 'csv' | 'json') {
    const exportColumns = columns.filter((column) => column.sortValue || column.exportValue)
    const pick = (row: T, column: Column<T>) =>
      column.exportValue?.(row) ?? column.sortValue?.(row) ?? ''

    let blob: Blob
    if (format === 'json') {
      const payload = sorted.map((row) =>
        Object.fromEntries(exportColumns.map((column) => [column.key, pick(row, column)])),
      )
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    } else {
      const escape = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`
      const lines = [
        exportColumns.map((column) => escape(column.header)).join(','),
        ...sorted.map((row) => exportColumns.map((column) => escape(pick(row, column))).join(',')),
      ]
      // BOM so Excel opens Arabic CSV in the right encoding.
      blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    }

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${exportName ?? 'export'}-${new Date().toISOString().slice(0, 10)}.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const selectedIds = [...selected]

  return (
    <GlassPanel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-2.5 sm:p-3">
        {searchable && (
          // Full row on phones, shares the row from `sm` up.
          <label className="relative min-w-0 flex-1 basis-full sm:basis-56">
            <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto size-3.5 text-neutral-500" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pr-9 pl-3 text-xs text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-sky-400/50"
            />
          </label>
        )}
        {toolbar}
        <span className="text-[11px] text-neutral-500">
          {sorted.length} من {rows.length}
        </span>
        {exportName && (
          <div className="flex items-center gap-1">
            <GlassButton size="sm" onClick={() => exportRows('csv')} title="تصدير CSV">
              <Download className="size-3" /> CSV
            </GlassButton>
            <GlassButton size="sm" onClick={() => exportRows('json')} title="تصدير JSON">
              <Download className="size-3" /> JSON
            </GlassButton>
          </div>
        )}
      </div>

      {selectable && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-400/20 bg-sky-400/[.06] px-3 py-2">
          <span className="text-[11px] font-medium text-sky-200">تم تحديد {selectedIds.length}</span>
          {renderBulkBar?.(selectedIds, clearSelection)}
          <GlassButton size="sm" className="mr-auto" onClick={clearSelection}>
            <X className="size-3" /> إلغاء التحديد
          </GlassButton>
        </div>
      )}

      {/* The one sanctioned horizontal-scroll surface: a 720px table cannot be
          legible on a 360px phone, so it scrolls sideways inside its own box
          (with a glassmorphic scrollbar) instead of widening the page. */}
      <div className="rc-scroll-x rc-scroll-x-dark">
        <table className="w-full min-w-[720px] border-collapse text-right text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/[.03]">
              {selectable && (
                <th className="w-9 px-3 py-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    aria-label="تحديد الكل في الصفحة"
                    className="size-3.5 accent-sky-400"
                  />
                </th>
              )}
              {columns.map((column) => {
                const isSorted = sortKey === column.key
                return (
                  <th
                    key={column.key}
                    className={cn(
                      'px-3 py-2 font-medium text-neutral-400 whitespace-nowrap',
                      column.align === 'end' && 'text-left',
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-neutral-100',
                          isSorted && 'text-sky-300',
                        )}
                      >
                        {column.header}
                        {isSorted &&
                          (direction === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={rowId(row)}
                className={cn(
                  'border-b border-white/5 transition-colors last:border-0 hover:bg-white/[.03]',
                  selected.has(rowId(row)) && 'bg-sky-400/[.06]',
                )}
              >
                {selectable && (
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(rowId(row))}
                      onChange={() => toggleRow(rowId(row))}
                      aria-label={`تحديد ${rowId(row)}`}
                      className="size-3.5 accent-sky-400"
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-2.5 align-middle text-neutral-300',
                      column.align === 'end' && 'text-left',
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageRows.length === 0 && (
        <div className="px-5 py-12 text-center text-xs text-neutral-500">{emptyMessage}</div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
          <span className="text-[11px] text-neutral-500">
            صفحة {currentPage} من {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <GlassButton size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              <ChevronRight className="size-3" /> السابق
            </GlassButton>
            <GlassButton size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
              التالي <ChevronLeft className="size-3" />
            </GlassButton>
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
