'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Crosshair, MapPin, RefreshCw, TriangleAlert } from 'lucide-react'
import { GlassCard, GlassPanel, StatusDot, EmptyState } from '@/components/admin/ui/glass'
import { MapShell } from '@/components/maps/map-shell'
import { inspectorLocationStatusLabels, type Tone } from '@/lib/admin/labels'
import {
  LOCATION_STALE_AFTER_MS,
  ageOf,
  formatArabicAgo,
  inspectorMarkers,
  type InspectorPlot,
} from '@/lib/maps/inspector-markers'
import { isPlottable, type MapTone } from '@/lib/maps/types'

/**
 * The live inspector map.
 *
 * ── Why the client owns the marker list ────────────────────────────────────
 * `inspectorMarkers` is pure, so it can run on either side. It runs here
 * because of one field: «آخر تحديث». A pin's age is the difference between a map
 * that is live and a map that merely looks live, and computing it on the server
 * freezes it at render time — an inspector whose phone died would keep reading
 * «قبل دقيقة» until someone reloaded the page. The browser clock keeps it
 * honest, and `router.refresh()` only has to move the coordinates.
 *
 * The rows arrive as `InspectorPlot`, a structural type, rather than as the
 * store's own row type: `lib/admin/extended-store.ts` is `server-only`, and the
 * page's rows satisfy this shape already, so nothing has to be adapted and no
 * server module leaks into this bundle.
 */

/** How often the ages are recomputed from the browser clock. */
const AGE_TICK_MS = 15_000

/**
 * How often the coordinates are re-fetched.
 *
 * `inspector_locations` is not on the Realtime publication yet, so this is a
 * poll. Thirty seconds is the compromise the reporter's own interval is built
 * around: faster than the staleness threshold, slow enough that a console left
 * open all day is not a meaningful query load.
 */
const REFRESH_MS = 30_000

const LEGEND: ReadonlyArray<{ tone: MapTone; label: string }> = [
  { tone: 'good', label: inspectorLocationStatusLabels.available },
  { tone: 'warn', label: inspectorLocationStatusLabels.en_route },
  { tone: 'info', label: inspectorLocationStatusLabels.inspecting },
  { tone: 'neutral', label: inspectorLocationStatusLabels.offline },
]

/** Matches `inspectorLocationStatusTone`, for the list's status dot. */
const STATUS_DOT_TONE: Record<string, Tone> = {
  available: 'good',
  en_route: 'warn',
  inspecting: 'neutral',
  offline: 'bad',
}

export function InspectorMapClient({ locations }: { locations: ReadonlyArray<InspectorPlot> }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [isPending, startTransition] = useTransition()

  // Ages move on their own; the data behind them does not.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), AGE_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [router])

  const markers = useMemo(() => inspectorMarkers(locations, now), [locations, now])

  // Keyed by id so the list and the map can never disagree about which pins
  // exist — the list is built from the markers, not from the raw rows. The two
  // lookups carry what a pin deliberately does not: the raw status enum and the
  // raw age, which the list renders as a label and a warning badge.
  const ages = useMemo(
    () => new Map(locations.map((location) => [location.id, ageOf(location.updated_at, now)])),
    [locations, now],
  )

  const statuses = useMemo(
    () => new Map(locations.map((location) => [location.id, location.status])),
    [locations],
  )

  const selected = markers.find((marker) => marker.id === selectedId) ?? null
  const focus = selected ? { latitude: selected.latitude, longitude: selected.longitude } : null

  const unplottable = useMemo(
    () => locations.filter((location) => !isPlottable(location)).length,
    [locations],
  )

  const refit = useCallback(() => setFitToken((token) => token + 1), [])
  const refreshNow = useCallback(() => startTransition(() => router.refresh()), [router])

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e3eaf2] bg-white px-3 py-1.5 text-[11px] font-medium text-[#33465f] transition hover:bg-[#f4f8fd]"
          >
            <Crosshair size={13} />
            ملاءمة العرض
          </button>
          <button
            type="button"
            onClick={refreshNow}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e3eaf2] bg-white px-3 py-1.5 text-[11px] font-medium text-[#33465f] transition hover:bg-[#f4f8fd] disabled:opacity-50"
          >
            <RefreshCw size={13} className={isPending ? 'animate-spin' : undefined} />
            تحديث
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#65768d]">
            {markers.length} على الخريطة
            {unplottable > 0 && <span className="text-amber-600"> · {unplottable} بدون إحداثيات</span>}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
            <StatusDot tone="good" pulse />
            تحديث كل {REFRESH_MS / 1000} ثانية
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Map */}
        <GlassCard
          title="المواقع اللحظية"
          className="lg:col-span-3"
          hint={selected ? <span className="text-[11px] text-[#65768d]">{selected.title}</span> : undefined}
        >
          {markers.length === 0 ? (
            <EmptyState>
              <span className="flex flex-col items-center gap-2">
                <MapPin size={20} className="text-[#94a3b8]" />
                <span className="font-medium text-[#33465f]">لا مواقع مُبلَّغة بعد</span>
                <span className="max-w-[34ch] text-[11px] leading-relaxed text-[#65768d]">
                  يظهر هنا موقع الفاحص لحظة إرساله من واجهة الميدان. الخريطة جاهزة وتعمل — تنتظر أول إشارة.
                </span>
              </span>
            </EmptyState>
          ) : (
            <MapShell
              markers={markers}
              onSelect={setSelectedId}
              focus={focus}
              fitToken={fitToken}
              minHeight={430}
            />
          )}

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#eef3f9] pt-3">
            {LEGEND.map((entry) => (
              <span key={entry.tone} className="inline-flex items-center gap-1.5 text-[10px] text-[#475d78]">
                <span className="fahes-legend-swatch" data-tone={entry.tone} />
                {entry.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[10px] text-[#475d78]">
              <TriangleAlert size={11} className="text-rose-600" />
              موقع مزيف
            </span>
          </div>
        </GlassCard>

        {/* Roster */}
        <GlassCard title="الفاحصون" className="lg:col-span-2" bodyClassName="max-h-[520px] overflow-y-auto">
          {markers.length === 0 ? (
            <EmptyState>لا فاحصين متصلين حاليًا</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {markers.map((marker) => {
                const age = ages.get(marker.id) ?? null
                const stale = age === null || age > LOCATION_STALE_AFTER_MS
                const isSelected = marker.id === selectedId
                return (
                  <button
                    key={marker.id}
                    type="button"
                    onClick={() => setSelectedId(marker.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-right transition ${
                      isSelected
                        ? 'border-[#bfd7f5] bg-[#f2f7fe]'
                        : 'border-[#e3eaf2] bg-slate-50/50 hover:bg-[#f7fafd]'
                    }`}
                  >
                    <StatusDot
                      tone={marker.flagged ? 'bad' : STATUS_DOT_TONE[statuses.get(marker.id) ?? ''] ?? 'neutral'}
                      pulse={marker.pulse === true}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-[#102444]">{marker.title}</span>
                      <span className="block text-[10px] text-[#65768d]">
                        {marker.subtitle || 'لا رقم'}
                        {age !== null && ` · ${formatArabicAgo(age)}`}
                      </span>
                    </span>
                    {marker.flagged && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200">
                        مزيف
                      </span>
                    )}
                    {!marker.flagged && stale && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                        قديم
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {selected && (
        <GlassPanel className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-[#102444]">{selected.title}</p>
              <p className="text-[11px] text-[#65768d]">{selected.subtitle || 'لا رقم مسجّل'}</p>
            </div>
            <span className="text-[10px] text-[#94a3b8]">اختر «ملاءمة العرض» للعودة إلى جميع الفاحصين</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {selected.details?.slice(0, 4).map((detail) => (
              <div key={detail.label}>
                <span className="block text-[10px] text-[#94a3b8]">{detail.label}</span>
                <span className="text-[11px] font-medium text-[#33465f]">{detail.value}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  )
}
