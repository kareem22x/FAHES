'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FieldClaimFeed } from './field-claim-feed'
import { FieldMap } from './field-map'
import { FieldBadges, FieldAnalyticsPanel, FieldWallet, FieldQrArchive } from './field-panels'
import { FieldPreferencesPanel, FieldSupport } from './field-support'
import { useFieldLocation } from './use-field-location'
import { useFieldPreferences, useHaptics, useOfflineQueue } from './field-hooks'
import { buildFieldAnalytics, buildWalletFromInspections, payoutReference, type CompletableInspection } from '@/lib/field/analytics'
import { CITY_COORDINATES, distanceMeters } from '@/lib/field/geo'
import type { AnalyticsRange, FieldOrderWithClaim, SupportTicket } from '@/lib/field/types'

/**
 * The client half of the field dashboard.
 *
 * Everything interactive lives here rather than in the page, for one concrete
 * reason: a server component cannot pass a callback to a client component. The
 * server page therefore hands this wrapper *data only*, and the wrapper owns
 * the handlers, the client-side derived values (distance, date range) and the
 * router refresh after a mutation.
 *
 * Keeping the split here also means the server page never has to know which
 * parts of the dashboard are interactive — it renders a list and this decides
 * how each one behaves.
 */
export function FieldDashboardClient({
  orders,
  inspections,
  badges,
  tickets,
  zones: initialZones,
  isOnline,
  reportOrigin,
  inspectorId,
  completedIds,
}: {
  orders: FieldOrderWithClaim[]
  /** The inspector's completed work, the input to both the wallet and analytics. */
  inspections: CompletableInspection[]
  badges: Array<{ key: import('@/lib/field/types').BadgeKey; earnedAt: string; metricValue: number | null }>
  tickets: SupportTicket[]
  zones: string[]
  /** Current availability flag — the profile endpoint requires both fields. */
  isOnline: boolean
  reportOrigin: string
  /** The inspector's own id, used to build a checkable payout reference. */
  inspectorId: string
  /** IDs of completed inspections, so the QR archive and wallet stay in step. */
  completedIds: string[]
}) {
  const router = useRouter()
  const haptics = useHaptics()
  const { fix } = useFieldLocation()
  const { preferences, update, loaded } = useFieldPreferences()
  const queue = useOfflineQueue()

  // Seed the derived state from the server once, at mount. A lazy initialiser
  // rather than an effect: an effect keyed on `initialZones` would re-run on
  // every server refresh and silently discard zones just toggled on screen.
  const [zones, setZones] = useState<string[]>(initialZones)
  const [savingZones, setSavingZones] = useState(false)
  const [range, setRange] = useState<AnalyticsRange>('month')
  const [requesting, setRequesting] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // A ref mirror of the selected zones, so `saveZones` can stay a stable
  // callback. If it depended on `zones` directly, the save button's handler
  // would be replaced on every toggle — and a save fired mid-toggle would send
  // whichever snapshot the closure happened to hold. The mirror is written
  // inside the toggle that changes `zones`, never during render.
  const pendingZonesRef = useRef<string[]>(initialZones)

  const selectZones = useCallback((next: string[]) => {
    pendingZonesRef.current = next
    setZones(next)
  }, [])

  // Zones are persisted in the inspector profile, so a save is a network call,
  // not local state. On failure the previous zones are restored rather than
  // leaving the screen claiming a coverage the server does not have.
  const saveZones = useCallback(async () => {
    setSavingZones(true)
    try {
      // The profile endpoint validates both fields at once, and it refuses
      // "available" with an empty coverage list — so asking for availability
      // with no zones is resolved by sending the current flag and letting the
      // server's own validation be the arbiter.
      const response = await fetch('/api/inspectors/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOnline, cities: pendingZonesRef.current }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'تعذّر حفظ مناطق العمل.')
      haptics('success')
      toast.success('تم تحديث مناطق العمل')
      router.refresh()
    } catch (cause) {
      haptics('error')
      setZones(initialZones)
      toast.error(cause instanceof Error ? cause.message : 'تعذّر حفظ مناطق العمل.')
    } finally {
      setSavingZones(false)
    }
  }, [haptics, initialZones, isOnline, router])
  // Distance-sorted orders, computed here so both the map and the feed see the
  // same ordering instead of each deriving its own.
  //
  // The reference point is the per-order coordinate when it exists and the city
  // centre otherwise. Without the fallback an inspector with a GPS fix sees no
  // distances at all on any order, because the rows have no coordinates yet —
  // which is exactly the case this app is in today.
  const locatedOrders = useMemo(() => {
    if (!fix) return orders
    return orders.map((order) => {
      const point =
        order.cityLatitude !== null && order.cityLongitude !== null
          ? { latitude: order.cityLatitude, longitude: order.cityLongitude }
          : CITY_COORDINATES[order.city]
      if (!point) return order
      return {
        ...order,
        cityLatitude: point.latitude,
        cityLongitude: point.longitude,
        distanceMeters: distanceMeters(fix.latitude, fix.longitude, point.latitude, point.longitude),
        // Marks a distance derived from the city centre rather than the vehicle,
        // so the feed can label it "≈" instead of implying street precision.
        cityCentreApproximation: order.cityLatitude === null,
      }
    })
  }, [fix, orders])

  // The map's input. Order rows currently carry no per-order coordinates, so the
  // city centre is the fallback — but the fallback must be applied *before* the
  // filter, not after, or every coordinate-less order is dropped and the map
  // renders empty while the list below it shows four cars.
  //
  // An order whose city is not in the coordinate table is dropped honestly: it
  // would have no position to draw, and inventing one would put a marker on a
  // city we do not serve.
  const mapOrders = useMemo(
    () =>
      locatedOrders.flatMap((order) => {
        const point =
          order.cityLatitude !== null && order.cityLongitude !== null
            ? { latitude: order.cityLatitude, longitude: order.cityLongitude }
            : CITY_COORDINATES[order.city]
        if (!point) return []
        return [{ ...order, cityLatitude: point.latitude, cityLongitude: point.longitude }]
      }),
    [locatedOrders],
  )

  const analytics = useMemo(() => buildFieldAnalytics(inspections, range), [inspections, range])
  const wallet = useMemo(() => buildWalletFromInspections(inspections), [inspections])
  const archive = useMemo(
    () =>
      inspections
        .filter((inspection) => completedIds.includes(inspection.id))
        .map((inspection) => ({
          id: inspection.id,
          vehicleLabel: `${inspection.vehicle.make} ${inspection.vehicle.model} ${inspection.vehicle.year}`,
          completedAt: inspection.scheduledAt,
          city: inspection.city,
        })),
    [completedIds, inspections],
  )

  const requestPayout = useCallback(async () => {
    if (wallet.availableBalance <= 0) return
    setRequesting(true)
    try {
      const requestedAt = new Date().toISOString()
      const response = await fetch('/api/inspector/field/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: wallet.availableBalance,
          reference: payoutReference(inspectorId, requestedAt),
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'تعذّر إرسال طلب التحويل.')
      haptics('success')
      toast.success('تم إرسال طلب التحويل — ستصل المتابعة من فريق المستحقات.')
    } catch (cause) {
      haptics('error')
      toast.error(cause instanceof Error ? cause.message : 'تعذّر إرسال طلب التحويل.')
    } finally {
      setRequesting(false)
    }
  }, [fix, haptics, inspectorId, wallet.availableBalance])

  const flush = useCallback(async () => {
    if (syncing || queue.pending.length === 0) return
    setSyncing(true)
    try {
      for (const item of queue.pending) {
        try {
          const response = await fetch('/api/inspector/field/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              claimId: item.content.claimId,
              inspectionId: item.content.inspectionId,
              actionType: item.content.actionType,
              actionDetail: item.content.actionDetail,
              recordedAtRfc3339: item.content.recordedAtRfc3339,
              latitude: item.content.latitude,
              longitude: item.content.longitude,
              accuracy: item.content.accuracy,
              payload: item.content.payload,
              contentHash: item.hash,
              offlineQueued: true,
            }),
          })
          if (!response.ok) {
            await queue.recordFailure(item.localId, `HTTP ${response.status}`)
            continue
          }
          await queue.dequeue(item.localId)
        } catch (cause) {
          // Still offline: stop rather than burn the queue against a dead link.
          await queue.recordFailure(item.localId, cause instanceof Error ? cause.message : 'network')
          break
        }
      }
    } finally {
      setSyncing(false)
    }
  }, [queue, syncing])

  const pendingCount = queue.available ? queue.pending.length : 0

  return (
    <>
      <FieldMap
        orders={mapOrders}
        inspectorFix={fix ? { latitude: fix.latitude, longitude: fix.longitude } : null}
        maxDistance={60_000}
        onSelect={(inspectionId) => {
          haptics('tap')
          router.push(`/inspector/field/${encodeURIComponent(inspectionId)}`)
        }}
      />

      <FieldClaimFeed
        orders={orders}
        zones={zones}
        onZonesChange={selectZones}
        onZonesSave={() => void saveZones()}
        savingZones={savingZones}
      />

      <FieldBadges earned={badges} />

      <FieldAnalyticsPanel analytics={analytics} range={range} onRangeChange={setRange} />

      <FieldWallet wallet={wallet} onRequestPayout={() => void requestPayout()} requesting={requesting} />

      <FieldQrArchive origin={reportOrigin} inspections={archive} />

      <FieldPreferencesPanel
        preferences={preferences}
        onChange={update}
        pendingCount={pendingCount}
        queueAvailable={queue.available}
        onSync={() => void flush()}
        syncing={syncing}
      />

      <FieldSupport tickets={tickets} inspectionId={null} claimId={null} />

      {/* `loaded` gates nothing visible, but reading it here keeps the
          preference effect honest: without it the panel would briefly render
          defaults and flash the wrong switch states on a dark handset. */}
      {!loaded && <span hidden data-field-preferences-loading />}
    </>
  )
}
