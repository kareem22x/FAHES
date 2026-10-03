'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CalendarClock,
  CarFront,
  Check,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import type { FieldOrderWithClaim } from '@/lib/field/types'
import { useFieldLocation } from './use-field-location'
import { useFieldAlert, useHaptics } from './field-hooks'

/** How far away an order may be and still be claimable, in metres. */
const MAX_CLAIM_DISTANCE_M = 60_000

type ClaimResponse = {
  status: string
  claimId?: string
  distanceM?: number
  city?: string
  error?: string
}

const verdictMessage: Record<string, string> = {
  already_claimed: 'سبقك فاحص آخر إلى هذا الطلب. ستظهر لك الطلبات المتاحة الأخرى.',
  already_yours: 'هذا الطلب مسند إليك بالفعل.',
  out_of_zone: 'هذا الطلب خارج مدن تغطيتك المحددة.',
  too_far: 'أنت بعيد عن موقع السيارة أكثر من الحد المسموح.',
  not_approved: 'حسابك لم يُعتمد بعد كفاحص ميداني.',
  closed: 'الطلب لم يعد متاحًا للاستلام.',
  not_found: 'لم يعد هذا الطلب موجودًا.',
  unknown_inspector: 'تعذّر التعرف على حسابك.',
  unavailable: 'خدمة الاستلام الميداني غير مفعّلة على هذه البيئة بعد.',
}

/**
 * The claim feed: the orders an inspector can take, filtered by the zones they
 * selected, with a one-tap claim.
 *
 * The claim itself is server-serialised. This component's job is to make the
 * *outcome* legible — telling an inspector "someone else got there first" in a
 * way that does not read as a failure of their own action, and refreshing the
 * list so the taken order disappears.
 */
export function FieldClaimFeed({
  orders,
  zones,
  onZonesChange,
  onZonesSave,
  savingZones,
}: {
  orders: FieldOrderWithClaim[]
  zones: string[]
  onZonesChange: (zones: string[]) => void
  onZonesSave: () => void
  savingZones: boolean
}) {
  const router = useRouter()
  const { fix, status: locationStatus, poorAccuracy } = useFieldLocation()
  const haptics = useHaptics()
  const { play, unlock } = useFieldAlert()
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  /** Great-circle distance, client-side, purely to sort and to show a hint. */
  const withDistance = useMemo(() => {
    if (!fix) return orders
    const toRadians = (value: number) => (value * Math.PI) / 180
    return orders
      .map((order) => {
        if (order.cityLatitude === null || order.cityLongitude === null) {
          return { ...order, distanceMeters: order.distanceMeters }
        }
        const dLat = toRadians(order.cityLatitude - fix.latitude)
        const dLng = toRadians(order.cityLongitude - fix.longitude)
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRadians(fix.latitude)) * Math.cos(toRadians(order.cityLatitude)) * Math.sin(dLng / 2) ** 2
        const metres = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return { ...order, distanceMeters: metres }
      })
      .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
  }, [orders, fix])

  const claim = useCallback(
    async (order: FieldOrderWithClaim) => {
      unlock()
      setClaimingId(order.inspectionId)
      setResult(null)
      try {
        const response = await fetch('/api/inspector/field/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inspectionId: order.inspectionId,
            latitude: fix?.latitude ?? null,
            longitude: fix?.longitude ?? null,
            accuracy: fix?.accuracy ?? null,
            maxDistanceMeters: MAX_CLAIM_DISTANCE_M,
          }),
        })
        const body = (await response.json()) as ClaimResponse
        const succeeded = response.ok && (body.status === 'ok' || body.status === 'already_yours')

        if (succeeded) {
          haptics('success')
          play()
          setResult({
            ok: true,
            message:
              body.status === 'already_yours'
                ? 'الطلب مسند إليك بالفعل — جارٍ فتحه.'
                : 'تم استلام الطلب. سجّلنا وقت الاستلام وموقعك في سجل التدقيق.',
          })
          toast.success('تم استلام الطلب')
          // The claim now exists server-side; the detail screen owns the rest.
          router.push(`/inspector/field/${encodeURIComponent(order.inspectionId)}`)
          return
        }

        haptics('warning')
        setResult({ ok: false, message: verdictMessage[body.status] ?? 'تعذّر استلام الطلب.' })
        if (body.status === 'already_claimed' || body.status === 'closed' || body.status === 'not_found') {
          router.refresh()
        }
      } catch {
        haptics('error')
        setResult({ ok: false, message: 'تعذّر الاتصال بالخدمة. سيُعاد المحاولة عند توفر الشبكة.' })
      } finally {
        setClaimingId(null)
      }
    },
    [fix, haptics, play, router, unlock],
  )

  return (
    <>
      <div className="field-ribbon">
        <span className={`field-chip ${fix ? (poorAccuracy ? 'is-warn' : 'is-ok') : 'is-warn'}`}>
          <MapPin size={13} />
          {fix
            ? `${fix.latitude.toFixed(4)}, ${fix.longitude.toFixed(4)}${fix.accuracy !== null ? ` · ±${Math.round(fix.accuracy)}م` : ''}`
            : locationStatus === 'requesting'
              ? 'جارٍ تحديد الموقع…'
              : 'لا يوجد تحديد موقع'}
        </span>
        {fix?.stale && <span className="field-chip is-warn"><AlertTriangle size={13} /> إحداثيات قديمة</span>}
        <span className="field-chip is-info"><ShieldCheck size={13} /> بدون تواصل مباشر مع العميل</span>
        <span className="field-chip field-chip-live is-ok">متصل</span>
      </div>

      <section className="inspector-requests-section" aria-label="مدن العمل">
        <div className="inspector-requests-heading">
          <div>
            <span className="inspector-section-kicker"><MapPin size={14} /> مناطق العمل المفضلة</span>
            <h2>حدّد مدن الاستلام</h2>
          </div>
          <span className="inspector-section-count">{zones.length} من {SUPPORTED_CITIES.length}</span>
        </div>
        <div className="field-zones" role="group" aria-label="مدن الاستلام">
          {SUPPORTED_CITIES.map((city) => {
            const selected = zones.includes(city)
            return (
              <button
                key={city}
                type="button"
                className={`inspector-city-option ${selected ? 'is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => {
                  haptics('tap')
                  onZonesChange(selected ? zones.filter((item) => item !== city) : [...zones, city])
                }}
              >
                {selected && <Check size={14} />}{city}
              </button>
            )
          })}
        </div>
        <div className="field-form-actions" style={{ marginTop: 12 }}>
          <button type="button" className="inspector-primary-link" onClick={onZonesSave} disabled={savingZones}>
            {savingZones ? <Loader2 size={15} /> : <Check size={15} />}
            {savingZones ? 'جارٍ الحفظ' : 'حفظ مناطق العمل'}
          </button>
        </div>
      </section>

      {result && (
        <p role="status" className={result.ok ? 'field-chip is-ok' : 'field-warning'} style={{ marginTop: 14, width: '100%' }}>
          {result.ok ? <Check size={15} /> : <AlertTriangle size={15} />}
          {result.message}
        </p>
      )}

      <section className="inspector-requests-section" aria-label="الطلبات المتاحة">
        <div className="inspector-requests-heading">
          <div>
            <span className="inspector-section-kicker"><Sparkles size={14} /> تلقيم الطلبات</span>
            <h2>طلبات في مدنك</h2>
          </div>
          <span className="inspector-section-count">{withDistance.length} طلب</span>
        </div>

        {withDistance.length === 0 ? (
          <div className="inspector-empty-state">
            <span><CarFront size={24} /></span>
            <h3>لا توجد طلبات في مدنك الآن</h3>
            <p>حدّد مدناً أكثر أو انتظر وصول طلب جديد. سيصلك تنبيه صوتي عند وصول طلب في مناطقك.</p>
          </div>
        ) : (
          <div className="field-order-grid">
            {withDistance.map((order) => {
              const mine = order.claim !== null
              const busy = claimingId === order.inspectionId
              return (
                <article key={order.inspectionId} className={`field-order ${mine ? 'is-mine' : ''}`}>
                  <header className="field-order-head">
                    <div className="field-order-vehicle">
                      <span className="field-order-icon"><CarFront size={20} /></span>
                      <div>
                        <h3 dir="rtl">{order.vehicle.make} {order.vehicle.model} {order.vehicle.year}</h3>
                        <p dir="rtl">{order.city}، {order.district}</p>
                      </div>
                    </div>
                    {mine ? (
                      <span className="field-chip is-ok"><ShieldCheck size={13} /> مسند إليك</span>
                    ) : order.distanceMeters !== null ? (
                      <span className="field-distance">
                        <Navigation size={13} />
                        {order.cityCentreApproximation ? '≈ ' : ''}
                        {order.distanceMeters < 1000
                          ? `${Math.round(order.distanceMeters)} م`
                          : `${(order.distanceMeters / 1000).toFixed(1)} كم`}
                      </span>
                    ) : null}
                  </header>

                  <div className="field-order-facts">
                    <div>
                      <Gauge size={14} />
                      <span>
                        <small>الممشى المعلن</small>
                        <strong>{order.vehicle.mileage !== null ? `${new Intl.NumberFormat('ar-SA').format(order.vehicle.mileage)} كم` : 'غير محدد'}</strong>
                      </span>
                    </div>
                    <div>
                      <CalendarClock size={14} />
                      <span>
                        <small>الموعد المطلوب</small>
                        <strong>{new Intl.DateTimeFormat('ar-SA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.scheduledAt))}</strong>
                      </span>
                    </div>
                    <div>
                      <MapPin size={14} />
                      <span>
                        <small>نوع الفحص</small>
                        <strong>{order.services.join('، ')}</strong>
                      </span>
                    </div>
                    <div>
                      <CarFront size={14} />
                      <span>
                        <small>اللوحة</small>
                        <strong dir="ltr">{order.vehicle.plateNumber || '—'}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="field-order-actions">
                    {mine ? (
                      <a className="inspector-primary-link" href={`/inspector/field/${encodeURIComponent(order.inspectionId)}`}>
                        <ShieldCheck size={15} /> متابعة الفحص
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="inspector-primary-link"
                        onClick={() => void claim(order)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 size={15} /> : <Check size={15} />}
                        {busy ? 'جارٍ الاستلام' : 'استلام الطلب'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
