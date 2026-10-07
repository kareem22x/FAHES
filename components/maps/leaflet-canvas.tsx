'use client'

/*
 * Import order is load-bearing. `leaflet.css` is unlayered third-party CSS, and
 * in this project unlayered rules outrank Tailwind utilities; our overrides have
 * to arrive in the same bundle immediately after it, or Leaflet wins the ties.
 * Both imports live here rather than in `globals.css` so that the pair is
 * ordered by construction and never by stylesheet-graph luck.
 */
import 'leaflet/dist/leaflet.css'
import '@/app/leaflet-map.css'

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { HOME_CENTER, HOME_ZOOM, viewFor, type LatLngTuple } from '@/lib/maps/bounds'
import { tileSourceFor } from '@/lib/maps/tiles'
import type { MapMarker, MapTone } from '@/lib/maps/types'

/**
 * The map itself.
 *
 * ── Why this file is only ever loaded dynamically ──────────────────────────
 * Leaflet touches `window` at module scope. A static import from a server
 * component therefore fails the build with "window is not defined", and the
 * usual workaround — a `typeof window` guard — does not help, because the
 * failure happens while the module is being evaluated, before any guard runs.
 * `components/maps/map-shell.tsx` loads this file with `ssr: false`, which is
 * the only arrangement that keeps Leaflet off the server.
 *
 * ── Why the pins are built from static markup ──────────────────────────────
 * `L.divIcon` takes `html` as a string, so it is the single place in this
 * component where React cannot escape text for us. Nothing from the database
 * goes into it: the pin renders a tone and a fixed glyph, and every piece of
 * real content — names, phones, coordinates — is rendered by `<Popup>`, which
 * is ordinary React and escapes on its own.
 */

/** Escapes the static glyph anyway, so the guarantee does not depend on callers. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/*
 * One `DivIcon` per distinct appearance, cached for the module's lifetime.
 *
 * Without the cache every render hands Leaflet a new icon object, which makes it
 * tear down and rebuild each marker's DOM — visible as pins blinking on every
 * poll. The set of appearances is tiny and closed, so the cache is bounded by
 * construction rather than by a size limit.
 */
const iconCache = new Map<string, L.DivIcon>()

function pinIcon(tone: MapTone, glyph: string | undefined, pulse: boolean, flagged: boolean): L.DivIcon {
  const key = `${tone}|${glyph ?? ''}|${pulse ? 1 : 0}|${flagged ? 1 : 0}`
  const cached = iconCache.get(key)
  if (cached) return cached

  const ring = pulse ? '<span class="fahes-pin-ring"></span>' : ''
  const icon = L.divIcon({
    // Replaces Leaflet's `leaflet-div-icon` entirely, which is what stops it
    // requesting the default marker PNGs that 404 under a bundler.
    className: 'fahes-pin-anchor',
    html: `${ring}<span class="fahes-pin" data-tone="${tone}" data-flagged="${flagged}">${escapeHtml(glyph ?? '')}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
  iconCache.set(key, icon)
  return icon
}

/**
 * The app's theme, read from the DOM.
 *
 * `next-themes` writes `data-theme` onto `<html>`; reading the attribute rather
 * than calling `useTheme()` keeps this component independent of the provider and
 * works in the test renderer, where no provider is mounted. The observer is what
 * makes an already-open map follow a theme change instead of needing a reload.
 */
function useDocumentTheme(): string {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const root = document.documentElement
    const read = () => setTheme(root.getAttribute('data-theme') ?? 'light')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

/**
 * Keeps the viewport where the operator put it.
 *
 * `center`/`zoom` are read once at mount and then owned by the user's panning,
 * so re-fitting has to go through the map instance — and re-fitting on every
 * poll is the failure mode this guards against. A live map that re-centres
 * itself every thirty seconds is unusable: an operator zoomed into one inspector
 * is thrown back out mid-look.
 *
 * So the rule is: fit on the first data that arrives, and afterwards only when
 * the caller explicitly asks by changing `fitToken` (the «ملاءمة العرض» button).
 * Selection is separate and always wins, because clicking a name in the list
 * must bring that pin into sight even if it sits outside the current envelope.
 */
function ViewportController({
  markers,
  focus,
  fitToken,
}: {
  markers: ReadonlyArray<MapMarker>
  focus?: { latitude: number; longitude: number } | null
  fitToken: number
}) {
  const map = useMap()
  const view = useMemo(() => viewFor(markers), [markers])
  const lastFitToken = useRef<number | null>(null)
  const hasFitted = useRef(false)

  useEffect(() => {
    if (view.kind === 'empty') return

    const explicitlyRequested = lastFitToken.current !== fitToken
    if (hasFitted.current && !explicitlyRequested) return

    lastFitToken.current = fitToken
    hasFitted.current = true

    if (view.kind === 'point') {
      map.setView(view.center, view.zoom)
      return
    }
    map.fitBounds(view.bounds, { padding: [48, 48], maxZoom: 15 })
  }, [map, view, fitToken])

  // Depends on the coordinate pair, not on the marker list. A refresh produces
  // a new array every time; a new array here would replay the fly-to animation
  // on every poll while a selection is open.
  const focusLat = focus?.latitude
  const focusLng = focus?.longitude

  useEffect(() => {
    if (focusLat === undefined || focusLng === undefined) return
    map.flyTo([focusLat, focusLng], Math.max(map.getZoom(), 13), { duration: 0.6 })
  }, [map, focusLat, focusLng])

  return null
}

/**
 * Enables wheel-zoom only once the map has been clicked.
 *
 * A map that swallows the wheel on load makes the page impossible to scroll past
 * on a laptop trackpad — and a map that never zooms is a picture. Leaflet's own
 * idiom is to hand the gesture over on focus, which this does, and to give it
 * back when the pointer leaves.
 */
function WheelZoomOnDemand() {
  const map = useMap()

  useEffect(() => {
    map.scrollWheelZoom.disable()
    const enable = () => map.scrollWheelZoom.enable()
    const disable = () => map.scrollWheelZoom.disable()

    map.on('click', enable)
    map.on('focus', enable)
    map.on('blur', disable)
    map.on('mouseout', disable)

    return () => {
      map.off('click', enable)
      map.off('focus', enable)
      map.off('blur', disable)
      map.off('mouseout', disable)
    }
  }, [map])

  return null
}

export type LeafletCanvasProps = {
  markers: ReadonlyArray<MapMarker>
  /** Called with a marker id when its pin is clicked. */
  onSelect?: (id: string) => void
  /** A point to fly to. Changing the coordinates re-centres the map. */
  focus?: { latitude: number; longitude: number } | null
  /** Bump this to re-fit the viewport to every marker. */
  fitToken?: number
  /** CSS min-height for the frame. See `--fahes-map-min-height`. */
  minHeight?: number
}

export default function LeafletCanvas({
  markers,
  onSelect,
  focus,
  fitToken = 0,
  minHeight = 320,
}: LeafletCanvasProps) {
  const theme = useDocumentTheme()
  const source = tileSourceFor(theme)
  const center = useMemo<LatLngTuple>(() => HOME_CENTER, [])

  return (
    <div className="fahes-map-frame" style={{ '--fahes-map-min-height': `${minHeight}px` } as React.CSSProperties}>
      <MapContainer
        className="fahes-map-canvas"
        center={center}
        zoom={HOME_ZOOM}
        // Wheel is granted on click; see `WheelZoomOnDemand`.
        scrollWheelZoom={false}
        zoomControl
        attributionControl
      >
        {/* Keyed on the URL so a theme switch swaps imagery instead of restyling it. */}
        <TileLayer
          key={source.url}
          url={source.url}
          attribution={source.attribution}
          subdomains={[...source.subdomains]}
          maxZoom={source.maxZoom}
        />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.latitude, marker.longitude]}
            icon={pinIcon(marker.tone, marker.glyph, marker.pulse === true, marker.flagged === true)}
            eventHandlers={onSelect ? { click: () => onSelect(marker.id) } : undefined}
            // The pin is decorative; the popup is the accessible label.
            alt={marker.title}
          >
            <Popup>
              <div className="flex flex-col gap-1">
                <p className="text-[12px] font-semibold text-[#102444]">{marker.title}</p>
                {marker.subtitle && <p className="text-[11px] text-[#65768d]">{marker.subtitle}</p>}
                {marker.details && marker.details.length > 0 && (
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-[#eef3f9] pt-1.5">
                    {marker.details.map((detail) => (
                      <div key={detail.label} className="contents">
                        <dt className="text-[10px] text-[#94a3b8]">{detail.label}</dt>
                        <dd className="text-[10px] font-medium text-[#33465f]">{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        <ViewportController markers={markers} focus={focus} fitToken={fitToken} />
        <WheelZoomOnDemand />
      </MapContainer>
    </div>
  )
}
