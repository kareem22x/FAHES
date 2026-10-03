'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassPanel } from '@/components/admin/ui/glass'

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
 * Dense, dependency-free data table — light theme.
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
      {/* ── Toolbar ── */}
      <div className="admin-table-toolbar">
        {searchable && (
          <label className="admin-search-box relative basis-full sm:basis-56">
            <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto size-3.5 text-[#94a3b8]" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder={searchPlaceholder}
              className="admin-search-input"
            />
          </label>
        )}
        {toolbar}
        <span className="admin-table-count">
          {sorted.length} من {rows.length}
        </span>
        {exportName && (
          <div className="flex items-center gap-1">
            <button className="admin-btn admin-btn-sm" onClick={() => exportRows('csv')} title="تصدير CSV">
              <Download className="size-3" /> CSV
            </button>
            <button className="admin-btn admin-btn-sm" onClick={() => exportRows('json')} title="تصدير JSON">
              <Download className="size-3" /> JSON
            </button>
          </div>
        )}
      </div>

      {/* ── Bulk action bar ── */}
      {selectable && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#bfdbfe] bg-[#eff6ff] px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-[#2563eb]">تم تحديد {selectedIds.length}</span>
          {renderBulkBar?.(selectedIds, clearSelection)}
          <button className="admin-btn admin-btn-sm mr-auto" onClick={clearSelection}>
            <X className="size-3" /> إلغاء التحديد
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    aria-label="تحديد الكل في الصفحة"
                    className="admin-checkbox"
                  />
                </th>
              )}
              {columns.map((column) => {
                const isSorted = sortKey === column.key
                return (
                  <th
                    key={column.key}
                    className={cn(column.align === 'end' && 'text-left')}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={cn(
                          'transition-colors hover:text-[#2563eb]',
                          isSorted && 'text-[#2563eb]',
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
                className={cn(selected.has(rowId(row)) && 'bg-[#eff6ff]')}
              >
                {selectable && (
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(rowId(row))}
                      onChange={() => toggleRow(rowId(row))}
                      aria-label={`تحديد ${rowId(row)}`}
                      className="admin-checkbox"
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
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
        <div className="px-5 py-12 text-center text-xs text-[#94a3b8]">{emptyMessage}</div>
      )}

      {totalPages > 1 && (
        <div className="admin-table-pagination">
          <span className="text-[11px] text-[#94a3b8]">
            صفحة {currentPage} من {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button className="admin-btn admin-btn-sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              <ChevronRight className="size-3" /> السابق
            </button>
            <button className="admin-btn admin-btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
              التالي <ChevronLeft className="size-3" />
            </button>
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
