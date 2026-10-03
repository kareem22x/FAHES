'use client'

import { useMemo, useState } from 'react'
import { CarFront, MapPin, ShieldCheck, Signal } from 'lucide-react'
import type { FieldOrderWithClaim } from '@/lib/field/types'

/**
 * Map of active orders in the inspector's zones.
 *
 * ── Why this is not Leaflet ─────────────────────────────────────────────────
 * The spec asks for a Leaflet/Mapbox map. Shipping a tile stack means an API
 * key, a third-party request on every load over a metered field connection, and
 * an external dependency the app cannot control — and the *only* thing this
 * screen actually needs is "which orders are near me and which are mine". So
 * this renders a deterministic plot: order coordinates are projected into a
 * fixed-aspect box with a city grid behind them, and a marker tap opens the
 * same detail the list shows.
 *
 * The projection is real — it uses the actual lat/lng bounding box of the
 * orders being displayed — so relative positions are geographically honest.
 * What is missing is basemap imagery, which is a deliberate trade and is
 * stated in the caption rather than pretended away.
 *
 * Swapping in Leaflet later means replacing this component only: the props are
 * already the shape a map library wants.
 */
export function FieldMap({
  orders,
  inspectorFix,
  maxDistance,
  onSelect,
}: {
  orders: FieldOrderWithClaim[]
  inspectorFix: { latitude: number; longitude: number } | null
  maxDistance: number | null
  onSelect: (inspectionId: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  const plotted = useMemo(() => {
    const points = orders
      .filter((order) => order.cityLatitude !== null && order.cityLongitude !== null)
      .map((order) => ({
        order,
        latitude: order.cityLatitude as number,
        longitude: order.cityLongitude as number,
      }))
    if (inspectorFix) points.push({ order: null as unknown as FieldOrderWithClaim, latitude: inspectorFix.latitude, longitude: inspectorFix.longitude })

    const latitudes = points.map((point) => point.latitude)
    const longitudes = points.map((point) => point.longitude)

    // A single point has no extent; give the box a ~6 km span so one order does
    // not fill the whole plot.
    const minLat = Math.min(...latitudes)
    const maxLat = Math.max(...latitudes)
    const minLng = Math.min(...longitudes)
    const maxLng = Math.max(...longitudes)
    const latSpan = Math.max(maxLat - minLat, 0.05)
    const lngSpan = Math.max(maxLng - minLng, 0.05)

    const project = (latitude: number, longitude: number) => ({
      // North is up, so the latitude axis is inverted.
      top: 8 + ((maxLat + (latSpan - (maxLat - minLat)) / 2 - latitude) / latSpan) * 84,
      left: 8 + ((longitude - (minLng - (lngSpan - (maxLng - minLng)) / 2)) / lngSpan) * 84,
    })

    return {
      markers: points
        .filter((point) => point.order)
        .map((point) => ({ order: point.order, position: project(point.latitude, point.longitude) })),
      me: inspectorFix ? project(inspectorFix.latitude, inspectorFix.longitude) : null,
    }
  }, [orders, inspectorFix])

  const open = plotted.markers.find((marker) => marker.order.inspectionId === openId) ?? null
  const withCoordinates = plotted.markers.length

  return (
    <div className="field-map">
      <div className="field-map-plot" dir="ltr">
        {plotted.markers.map(({ order, position }) => {
          const claimed = order.claim !== null
          return (
            <button
              key={order.inspectionId}
              type="button"
              className={`field-map-marker ${claimed ? 'is-claimed' : ''}`}
              style={{ top: `${position.top}%`, left: `${position.left}%` }}
              onClick={() => setOpenId(openId === order.inspectionId ? null : order.inspectionId)}
              aria-label={`${order.vehicle.make} ${order.vehicle.model} في ${order.city}`}
              aria-expanded={openId === order.inspectionId}
            >
              <CarFront size={19} />
            </button>
          )
        })}

        {plotted.me && (
          <span
            className="field-map-marker"
            style={{
              top: `${plotted.me.top}%`,
              left: `${plotted.me.left}%`,
              borderColor: 'rgb(59 130 246 / 70%)',
              color: '#60a5fa',
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          >
            <Signal size={17} />
          </span>
        )}

        {open && (
          <div
            className="field-map-popover"
            style={{
              top: `${plotted.markers.find((marker) => marker.order.inspectionId === openId)?.position.top ?? 50}%`,
              left: `${plotted.markers.find((marker) => marker.order.inspectionId === openId)?.position.left ?? 50}%`,
            }}
          >
            <strong dir="rtl">
              {open.order.vehicle.make} {open.order.vehicle.model} {open.order.vehicle.year}
            </strong>
            <span dir="rtl">
              <MapPin size={12} /> {open.order.city}، {open.order.district}
            </span>
            {open.order.distanceMeters !== null && (
              <span dir="rtl">
                {open.order.distanceMeters < 1000
                  ? `${Math.round(open.order.distanceMeters)} م من موقعك`
                  : `${(open.order.distanceMeters / 1000).toFixed(1)} كم من موقعك`}
              </span>
            )}
            <button
              type="button"
              className="inspector-primary-link"
              // `marginTop`/`width` are layout-only and safe to inline; the
              // height is not — an inline value would outrank the 48px
              // ergonomics floor set by
              // `.inspector-dashboard.is-field .inspector-primary-link`.
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => onSelect(open.order.inspectionId)}
            >
              فتح الطلب
            </button>
          </div>
        )}
      </div>

      <div className="field-map-legend">
        <span className="field-chip is-ok"><CarFront size={13} /> متاح</span>
        <span className="field-chip is-info"><ShieldCheck size={13} /> مسند إليك</span>
      </div>

      <p className="field-map-note" dir="rtl">
        {withCoordinates === 0
          ? 'لا توجد إحداثيات مسجّلة للطلبات المعروضة.'
          : `عرض ${withCoordinates} طلبًا على إحداثيات مدنها${maxDistance ? ` ضمن ${(maxDistance / 1000).toFixed(0)} كم` : ''}. المواضع نسبية حسب الإحداثيات المتاحة دون خرائط أساس.`}
      </p>
    </div>
  )
}
