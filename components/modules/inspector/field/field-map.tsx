'use client'

import { useMemo, useState } from 'react'
import { CarFront, MapPin, ShieldCheck, Signal } from 'lucide-react'
import { MapShell } from '@/components/maps/map-shell'
import { plottableMarkers, type MapMarker } from '@/lib/maps/types'
import type { FieldOrderWithClaim } from '@/lib/field/types'

/**
 * Map of active orders in the inspector's zones.
 *
 * ── What changed, and why the old version was replaced ─────────────────────
 * This used to project order coordinates into a fixed box with a grid behind
 * them. The projection was honest about relative positions, but the component
 * said so in its own caption — "المواضع نسبية حسب الإحداثيات المتاحة دون خرائط
 * أساس" — and a caption admitting there is no map is not a map. An inspector
 * deciding whether two jobs fit in one afternoon needs streets, not a scatter
 * plot.
 *
 * The replacement is Leaflet against open tiles: no API key, no third-party
 * script, and the basemap swaps with the theme. The props are unchanged, which
 * is what the old docblock predicted — "swapping in Leaflet later means
 * replacing this component only".
 *
 * ── The two honesty rules survive ──────────────────────────────────────────
 * Coordinates here are still the *city centre* when an order has no position of
 * its own, so the legend and the note still say which is which, and the
 * "approx" flag still travels with the order. A real basemap makes a
 * city-centre pin look far more precise than it is, which is precisely why the
 * caption has to stay.
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
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const markers = useMemo<MapMarker[]>(() => {
    const orderMarkers: MapMarker[] = orders
      .filter((order) => order.cityLatitude !== null && order.cityLongitude !== null)
      .map((order) => {
        const claimed = order.claim !== null
        return {
          id: order.inspectionId,
          latitude: order.cityLatitude as number,
          longitude: order.cityLongitude as number,
          // Green is a job anyone can take; amber is one already assigned to the
          // inspector reading the screen.
          tone: claimed ? 'warn' : 'good',
          glyph: claimed ? '✓' : undefined,
          title: `${order.vehicle.make} ${order.vehicle.model} ${order.vehicle.year}`,
          subtitle: `${order.city}، ${order.district}`,
          details: [
            {
              label: 'المسافة',
              value:
                order.distanceMeters === null
                  ? 'غير معروفة'
                  : order.distanceMeters < 1000
                    ? `${Math.round(order.distanceMeters)} م من موقعك`
                    : `${(order.distanceMeters / 1000).toFixed(1)} كم من موقعك`,
            },
            { label: 'الحالة', value: claimed ? 'مسند إليك' : 'متاح' },
            ...(order.cityCentreApproximation
              ? [{ label: 'الموقع', value: 'مركز المدينة (تقريبي)' }]
              : []),
          ],
          pulse: claimed,
        } satisfies MapMarker
      })

    // The inspector's own position is drawn last so it sits on top, and in blue
    // so it is never confused with a job.
    if (inspectorFix) {
      orderMarkers.push({
        id: '__self__',
        latitude: inspectorFix.latitude,
        longitude: inspectorFix.longitude,
        tone: 'info',
        glyph: '+',
        title: 'موقعك الحالي',
        details: [
          { label: 'الإحداثيات', value: `${inspectorFix.latitude.toFixed(4)}، ${inspectorFix.longitude.toFixed(4)}` },
        ],
      })
    }

    return plottableMarkers(orderMarkers)
  }, [orders, inspectorFix])

  const withCoordinates = markers.filter((marker) => marker.id !== '__self__').length
  const approximate = orders.filter((order) => order.cityCentreApproximation).length

  return (
    <div className="field-map">
      <MapShell
        markers={markers}
        onSelect={(id) => {
          if (id === '__self__') return
          setSelectedId(id)
          onSelect(id)
        }}
        focus={
          selectedId
            ? (() => {
                const marker = markers.find((entry) => entry.id === selectedId)
                return marker ? { latitude: marker.latitude, longitude: marker.longitude } : null
              })()
            : null
        }
        minHeight={280}
      />

      <div className="field-map-legend">
        <span className="field-chip is-ok">
          <CarFront size={13} /> متاح
        </span>
        <span className="field-chip is-info">
          <ShieldCheck size={13} /> مسند إليك
        </span>
        <span className="field-chip">
          <Signal size={13} /> موقعك
        </span>
      </div>

      <p className="field-map-note" dir="rtl">
        {withCoordinates === 0 ? (
          <span>
            <MapPin size={12} /> لا توجد إحداثيات مسجّلة للطلبات المعروضة.
          </span>
        ) : (
          `عرض ${withCoordinates} طلبًا على الخريطة${maxDistance ? ` ضمن ${(maxDistance / 1000).toFixed(0)} كم` : ''}.` +
          (approximate > 0
            ? ` ${approximate} منها موضوعة على مركز مدينتها لا على موقع السيارة، فالمسافة إليها تقريبية.`
            : '')
        )}
      </p>
    </div>
  )
}
