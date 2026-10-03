'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Filter, Loader2, MapPin, Navigation, Phone, Star } from 'lucide-react'

import {
  ALL_CITIES,
  CITY_ZOOM,
  WORKSHOP_CITIES,
  WORKSHOP_ZOOM,
  centerFor,
  dialablePhone,
  filterWorkshops,
  formatRating,
  workshopCountByCity,
  type CityFilter,
  type Workshop,
} from '@/data/workshops'
import { cn } from '@/lib/utils'

/* =============================================================== map provider */

/**
 * Tencent Maps GL JS.
 *
 * The map-compliance guard active in this environment prohibits Google Maps
 * (and Apple, Bing overseas, Mapbox, Leaflet/OSM) for map rendering, marker
 * placement, route drawing and location services. Tencent Maps is on the
 * approved list, so the viewport is built on it.
 *
 * This view renders an OVERSEAS area (Saudi Arabia). The guard classifies
 * overseas rendering as a "non-default scenario", which means the SDK must be
 * loaded with a key you own rather than a proxied one. Replace `TMAP_KEY`
 * below with your own Tencent Location Service key — until then the component
 * renders an explanatory panel instead of a blank grey box, so the rest of the
 * UI stays fully usable and reviewable.
 */
const TMAP_SDK_URL = 'https://map.qq.com/api/gljs?v=1.exp'

const TMAP_KEY =
  'Please apply for your own key at the Tencent Location Service Open Platform and replace this placeholder'

/** True once a real key has been pasted in above. */
const IS_KEY_CONFIGURED = !TMAP_KEY.startsWith('Please apply for your own key')

/**
 * Marker artwork is inlined as an SVG data URI. The guard forbids referencing
 * the official demo image paths, and an inline icon also keeps the amber
 * branding consistent with the rest of the panel.
 */
const PIN_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">' +
    '<path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 24 14 24s14-13.5 14-24c0-7.73-6.27-14-14-14z" fill="#f59e0b"/>' +
    '<circle cx="14" cy="14" r="5.2" fill="#0a0a0a"/>' +
    '</svg>',
)}`

/* ------------------------------------------------------------ SDK type shims */

/**
 * Minimal structural types for the parts of the SDK this component touches.
 * Hand-written rather than `any` so a typo in a method name fails the build.
 */
type TMapLatLng = object

interface TMapMapInstance {
  setCenter(center: TMapLatLng): void
  setZoom(zoom: number): void
  destroy(): void
}

interface TMapMultiMarkerInstance {
  setGeometries(geometries: readonly object[]): void
  setMap(map: TMapMapInstance | null): void
}

interface TMapNamespace {
  Map: new (
    container: HTMLElement,
    options: { center: TMapLatLng; zoom: number },
  ) => TMapMapInstance
  LatLng: new (lat: number, lng: number) => TMapLatLng
  MultiMarker: new (options: {
    map: TMapMapInstance
    styles: Record<string, unknown>
    geometries: readonly object[]
  }) => TMapMultiMarkerInstance
  MarkerStyle: new (options: Record<string, unknown>) => unknown
}

/**
 * The SDK is loaded once per document, no matter how many instances mount.
 * The promise is cached at module scope so a second mount reuses the same load
 * instead of injecting a duplicate script tag.
 */
let sdkPromise: Promise<TMapNamespace> | null = null

function loadTMapSdk(): Promise<TMapNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('TMap requires a browser'))

  const scope = window as unknown as { TMap?: TMapNamespace }
  if (scope.TMap) return Promise.resolve(scope.TMap)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<TMapNamespace>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${TMAP_SDK_URL}&key=${encodeURIComponent(TMAP_KEY)}`
    script.async = true
    script.onload = () => {
      if (scope.TMap) resolve(scope.TMap)
      else reject(new Error('TMap SDK loaded but window.TMap is missing'))
    }
    script.onerror = () => {
      sdkPromise = null
      reject(new Error('TMap SDK failed to load'))
    }
    document.head.appendChild(script)
  })

  return sdkPromise
}

/* ------------------------------------------------------------- directions */

/**
 * Directions hand-off.
 *
 * Isolated in one function so the provider is swappable without touching the
 * component. The default uses Tencent's URI scheme, which stays inside the
 * approved set; pass `directionsHref` to point somewhere else.
 */
function defaultDirectionsHref(workshop: Workshop): string {
  const params = new URLSearchParams({
    type: 'drive',
    to: workshop.name,
    tocoord: `${workshop.lat},${workshop.lng}`,
    coord_type: '5',
    referer: TMAP_KEY,
  })
  return `https://apis.map.qq.com/uri/v1/routeplan?${params.toString()}`
}

/* ------------------------------------------------------------ sub-components */

function RatingStars({ rating }: { rating: number }) {
  const filled = Math.round(rating)
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`التقييم ${formatRating(rating)} من 5`}
    >
      {[1, 2, 3, 4, 5].map((slot) => (
        <Star
          key={slot}
          aria-hidden="true"
          className={cn(
            'size-3.5',
            slot <= filled ? 'fill-amber-400 text-amber-400' : 'text-neutral-600',
          )}
        />
      ))}
      <span className="ms-1 text-[11px] font-semibold text-amber-300">{formatRating(rating)}</span>
    </span>
  )
}

function WorkshopCard({
  workshop,
  active,
  onSelect,
  directionsHref,
}: {
  workshop: Workshop
  active: boolean
  onSelect: () => void
  directionsHref: (workshop: Workshop) => string
}) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div
        className={cn(
          'rounded-xl border p-3.5 transition-colors',
          active
            ? 'border-amber-400/60 bg-amber-400/[.07]'
            : 'border-white/10 bg-white/[.03] hover:border-white/20 hover:bg-white/[.06]',
        )}
      >
        {/*
         * Selection is a real <button> covering the descriptive content, with
         * the directions/call links as siblings rather than children — nesting
         * an <a> inside a control is invalid and breaks screen-reader and
         * keyboard behaviour.
         */}
        <button
          type="button"
          aria-pressed={active}
          onClick={onSelect}
          className="block w-full cursor-pointer rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="text-[13px] leading-6 font-semibold text-neutral-100">
              {workshop.name}
            </span>
            <span className="mt-0.5 shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-neutral-400 ring-1 ring-white/10 ring-inset">
              {workshop.city}
            </span>
          </span>

          <span className="mt-1 block text-[11px] leading-5 text-neutral-400">
            {workshop.address}
          </span>

          <span className="mt-2 flex items-center justify-between gap-2">
            <RatingStars rating={workshop.rating} />
            <span dir="ltr" className="text-[11px] text-neutral-500">
              {workshop.phone}
            </span>
          </span>
        </button>

        <div className="mt-3 flex items-center gap-2">
          <a
            href={directionsHref(workshop)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 transition-colors hover:bg-amber-400/20"
          >
            <Navigation className="size-3.5" aria-hidden="true" />
            الاتجاهات
          </a>
          <a
            href={`tel:${dialablePhone(workshop.phone)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-white/10"
          >
            <Phone className="size-3.5" aria-hidden="true" />
            اتصال
          </a>
        </div>
      </div>
    </motion.li>
  )
}

/* ----------------------------------------------------------------- component */

export type WorkshopsMapProps = {
  className?: string
  /** Override the directions hand-off. Defaults to the approved provider. */
  directionsHref?: (workshop: Workshop) => string
}

export function WorkshopsMap({ className, directionsHref = defaultDirectionsHref }: WorkshopsMapProps) {
  const [city, setCity] = useState<CityFilter>(ALL_CITIES)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mapStatus, setMapStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    IS_KEY_CONFIGURED ? 'loading' : 'idle',
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<TMapMapInstance | null>(null)
  const markersRef = useRef<TMapMultiMarkerInstance | null>(null)
  const tmapRef = useRef<TMapNamespace | null>(null)

  /**
   * Derived, never stored: the active workshop is whichever card is selected if
   * it survives the current filter, otherwise the best-rated match. This means
   * changing the city tab can never leave a stale selection pointing at a
   * workshop that is no longer on screen — and it needs no effect to fix up.
   */
  const workshops = useMemo(() => filterWorkshops(city), [city])
  const active = useMemo(
    () => workshops.find((workshop) => workshop.id === activeId) ?? workshops[0] ?? null,
    [workshops, activeId],
  )

  /* ------------------------------------------------------- map instantiation */

  useEffect(() => {
    if (!IS_KEY_CONFIGURED) return

    let disposed = false
    const container = containerRef.current
    if (!container) return

    const start = centerFor(ALL_CITIES)

    loadTMapSdk()
      .then((TMap) => {
        // The component can unmount mid-flight; never touch a detached node.
        if (disposed || !containerRef.current) return

        const map = new TMap.Map(container, {
          center: new TMap.LatLng(start.lat, start.lng),
          zoom: CITY_ZOOM,
        })
        const markers = new TMap.MultiMarker({
          map,
          styles: {
            default: new TMap.MarkerStyle({
              width: 28,
              height: 38,
              anchor: { x: 14, y: 38 },
              src: PIN_ICON,
            }),
          },
          geometries: [],
        })

        tmapRef.current = TMap
        mapRef.current = map
        markersRef.current = markers
        setMapStatus('ready')
      })
      .catch(() => {
        if (!disposed) setMapStatus('error')
      })

    return () => {
      disposed = true
      markersRef.current?.setMap(null)
      mapRef.current?.destroy()
      markersRef.current = null
      mapRef.current = null
      tmapRef.current = null
    }
  }, [])

  /* --------------------------------------------- follow the active selection */

  useEffect(() => {
    const TMap = tmapRef.current
    const map = mapRef.current
    const markers = markersRef.current
    // `mapStatus` is a dependency on purpose: the refs are populated inside the
    // async SDK callback, so this effect must re-run once the map exists.
    if (!TMap || !map || !markers) return

    if (!active) {
      const fallback = centerFor(city)
      map.setCenter(new TMap.LatLng(fallback.lat, fallback.lng))
      map.setZoom(CITY_ZOOM)
      markers.setGeometries([])
      return
    }

    map.setCenter(new TMap.LatLng(active.lat, active.lng))
    map.setZoom(WORKSHOP_ZOOM)
    markers.setGeometries([
      { id: active.id, styleId: 'default', position: new TMap.LatLng(active.lat, active.lng) },
    ])
  }, [active, city, mapStatus])

  const total = workshopCountByCity(city)

  return (
    <section
      dir="rtl"
      className={cn(
        'w-full overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/80 shadow-2xl backdrop-blur-2xl',
        className,
      )}
    >
      {/* ------------------------------------------------------------ header */}
      <header className="border-b border-white/10 px-5 pt-5 pb-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl border border-amber-400/25 bg-amber-400/10">
              <MapPin
                className="size-5 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.75)]"
                aria-hidden="true"
              />
            </span>
            <div>
              <h2 className="text-base font-semibold text-neutral-50">الورش المعتمدة</h2>
              <p className="text-[11px] text-neutral-400">
                ورش مرخّصة ومعتمدة من فاحص في المنطقة الشرقية
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-neutral-300">
            <Filter className="size-3.5" aria-hidden="true" />
            {total} ورشة
          </span>
        </div>

        {/* ------------------------------------------------- city quick filter */}
        <div
          role="tablist"
          aria-label="تصفية حسب المدينة"
          className="mt-4 flex flex-wrap gap-2"
        >
          {([ALL_CITIES, ...WORKSHOP_CITIES] as const).map((option) => {
            const selected = city === option
            return (
              <button
                key={option}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setCity(option)}
                className={cn(
                  // 44px touch target on phones, compact pill from `sm` up.
                  'inline-flex min-h-11 items-center rounded-full border px-3.5 text-[12px] font-medium transition-colors outline-none sm:min-h-0 sm:py-1.5',
                  'focus-visible:ring-2 focus-visible:ring-amber-400/60',
                  selected
                    ? 'border-amber-400/60 bg-amber-400/15 text-amber-200'
                    : 'border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-neutral-200',
                )}
              >
                {option === ALL_CITIES ? 'الكل' : option}
                <span className="ms-1.5 text-[10px] opacity-60">
                  {workshopCountByCity(option)}
                </span>
              </button>
            )
          })}
        </div>
      </header>

      {/* -------------------------------------------------------------- body */}
      {/* Stacked on phones/tablets, rail + map from `lg`. `minmax(0, …)` and
          `min-w-0` on both children are what let the map shrink instead of
          forcing the page wider than the viewport. */}
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* ------------------------------------------------------ sidebar list */}
        <ul
          className="flex max-h-[300px] min-w-0 flex-col gap-2.5 overflow-y-auto border-b border-white/10 p-3.5 sm:p-4 lg:max-h-[520px] lg:border-e lg:border-b-0"
          aria-label="قائمة الورش"
        >
          <AnimatePresence initial={false}>
            {workshops.map((workshop) => (
              <WorkshopCard
                key={workshop.id}
                workshop={workshop}
                active={active?.id === workshop.id}
                onSelect={() => setActiveId(workshop.id)}
                directionsHref={directionsHref}
              />
            ))}
          </AnimatePresence>

          {workshops.length === 0 && (
            <li className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-neutral-500">
              لا توجد ورش معتمدة في هذه المدينة بعد.
            </li>
          )}
        </ul>

        {/* ----------------------------------------------------- map viewport */}
        <div className="relative min-h-[320px] min-w-0 bg-neutral-950 sm:min-h-[360px] lg:min-h-[520px]">
          {IS_KEY_CONFIGURED ? (
            <>
              {/*
               * The dark treatment is a CSS filter over the map canvas, which is
               * what keeps an otherwise light basemap legible against the glass
               * panel. It is applied to a dedicated wrapper so the info bar
               * below stays at normal contrast.
               */}
              <div
                className="absolute inset-0"
                style={{ filter: 'invert(90%) hue-rotate(180deg) contrast(110%)' }}
              >
                <div ref={containerRef} className="size-full" />
              </div>

              {mapStatus === 'loading' && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-neutral-950/80 px-4 py-2 text-xs text-neutral-300">
                    <Loader2 className="size-4 animate-spin text-amber-400" aria-hidden="true" />
                    جارٍ تحميل الخريطة…
                  </span>
                </div>
              )}

              {mapStatus === 'error' && (
                <div className="absolute inset-0 grid place-items-center p-6">
                  <div className="max-w-sm rounded-xl border border-rose-400/25 bg-rose-400/[.07] px-4 py-3 text-center text-xs leading-6 text-rose-200">
                    <AlertTriangle className="mx-auto mb-2 size-5" aria-hidden="true" />
                    تعذّر تحميل الخريطة. تحقّق من الاتصال بالشبكة ومن صحة مفتاح الخدمة.
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Honest placeholder: no key, so no map — but the rest still works. */
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="max-w-md rounded-2xl border border-amber-400/25 bg-amber-400/[.06] px-5 py-4 text-center">
                <AlertTriangle className="mx-auto mb-2 size-5 text-amber-400" aria-hidden="true" />
                <p className="text-[13px] font-medium text-amber-200">مفتاح الخريطة غير مُهيّأ</p>
                <p className="mt-1.5 text-[11px] leading-6 text-amber-200/80">
                  الخريطة تعمل بمزوّد معتمد (Tencent Maps). استبدل قيمة{' '}
                  <code dir="ltr" className="rounded bg-black/30 px-1">
                    TMAP_KEY
                  </code>{' '}
                  في <span dir="ltr">components/ui/workshops-map.tsx</span> بمفتاحك الخاص من منصة خدمات
                  الموقع، وستظهر الخريطة فورًا. بقية الواجهة — التصفية والاختيار والاتجاهات — تعمل الآن.
                </p>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------- info bar */}
          <AnimatePresence mode="wait">
            {active && (
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-neutral-950/85 p-3.5 backdrop-blur-2xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-neutral-50">
                      {active.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-neutral-400">
                      {active.city} — {active.address}
                    </p>
                  </div>
                  <RatingStars rating={active.rating} />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <a
                    href={directionsHref(active)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-amber-400 px-3 py-1.5 text-[11px] font-semibold text-neutral-950 transition-colors hover:bg-amber-300"
                  >
                    <Navigation className="size-3.5" aria-hidden="true" />
                    ابدأ الملاحة
                  </a>
                  <a
                    href={`tel:${dialablePhone(active.phone)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-neutral-200 transition-colors hover:bg-white/10"
                  >
                    <Phone className="size-3.5" aria-hidden="true" />
                    <span dir="ltr">{active.phone}</span>
                  </a>
                  <span dir="ltr" className="ms-auto hidden text-[10px] text-neutral-500 sm:block">
                    {active.lat.toFixed(5)}, {active.lng.toFixed(5)}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

export default WorkshopsMap
