import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowRight, CalendarClock, CarFront, Gauge, MapPin, ShieldCheck } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { FieldShell } from '@/components/modules/inspector/field/field-shell'
import { FieldVerification } from '@/components/modules/inspector/field/field-verification'
import { FieldEscalation } from '@/components/modules/inspector/field/field-escalation'
import { FieldAuditTrail } from '@/components/modules/inspector/field/field-audit'
import { requireRoles } from '@/lib/auth'
import { getInspectorInspection } from '@/lib/inspection-store'
import { getLiveClaimForInspector, listClaimMedia, listInspectionAuditTrail, listOutgoingHandovers } from '@/lib/field/store'
import { verifyChainLinks } from '@/lib/field/chain'
import { COMING_SOON_MESSAGE, SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import type { FieldAction, HandoverRequest, MandatoryPhotoKey, VerificationPhoto } from '@/lib/field/types'
import { mandatoryPhotoSequence } from '@/lib/field/types'
import { getUserById } from '@/lib/user-store'

export const metadata: Metadata = {
  title: 'تفاصيل الفحص الميداني',
}

export const dynamic = 'force-dynamic'

/**
 * Order detail — where a claim is actually worked.
 *
 * Three things share this screen because they are one continuous act in the
 * field: verify the car is the right car, document it, and — if it turns out it
 * is not the right car — say so with a reason. Splitting them across routes
 * would mean an inspector with a showroom manager waiting has to navigate
 * mid-job, which is how records end up incomplete.
 *
 * The address is shown here but *not* on the feed: an unclaimed order tells an
 * inspector the approximate area, the exact address is only theirs once the
 * order is theirs. That is enforced by the query, not by conditional rendering.
 */
export default async function FieldOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireRoles(['inspector'])
  const { id: inspectionId } = await params

  const user = await getUserById(session.sub)
  const zones = user?.inspectorProfile?.cities ?? []

  // An owner wearing the inspector hat holds the surface but has no approved
  // coverage of their own, so `zones` is empty for them. Falling back to the
  // five supported cities is what lets them open — and act on — an order at all;
  // without it the owner's field tooling would render a 404 on every link.
  const inspection = await getInspectorInspection(
    inspectionId,
    session.sub,
    zones.length > 0 ? zones : [...SUPPORTED_CITIES],
  )
  if (!inspection) notFound()

  const [claim, handovers, auditRows, mediaRows] = await Promise.all([
    getLiveClaimForInspector(session.sub, inspectionId),
    listOutgoingHandovers(session.sub),
    listInspectionAuditTrail(inspectionId),
    getLiveClaimForInspector(session.sub, inspectionId).then((live) =>
      live ? listClaimMedia(live.id) : Promise.resolve([]),
    ),
  ])

  // The pending-handover window is open/closed, not a value to re-evaluate on
  // every render: deciding it once at request time keeps the render pure and
  // means the action is not visible a moment before it expires.
  const pendingHandover: HandoverRequest | null =
    (handovers.find((row) => {
      if (row.inspection_id !== inspectionId || row.status !== 'pending') return false
      return true
    }) as HandoverRequest | undefined) ?? null

  // The chain is verified server-side and its verdict handed down as a boolean.
  // Re-verifying in the browser would mean shipping every hash to the client,
  // and a client that can recompute the chain can also be made to lie about it.
  const actions: FieldAction[] = auditRows.map((row) => ({
    id: row.id,
    claimId: row.claim_id,
    inspectionId: row.inspection_id,
    inspectorId: row.inspector_id,
    actionType: row.action_type,
    actionDetail: row.action_detail,
    recordedAtRfc3339: row.recorded_at_rfc3339,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy_m,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    prevHash: row.prev_hash,
    contentHash: row.content_hash,
    deviceMonotonicMs: row.device_monotonic_ms,
    offlineQueued: row.offline_queued,
    createdAt: row.created_at,
  }))

  const chain = verifyChainLinks(
    auditRows.map((row) => ({
      id: row.id,
      claimId: row.claim_id,
      inspectionId: row.inspection_id,
      inspectorId: row.inspector_id,
      actionType: row.action_type,
      actionDetail: row.action_detail,
      recordedAtRfc3339: row.recorded_at_rfc3339,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy_m,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      prevHash: row.prev_hash,
      contentHash: row.content_hash,
    })),
  )

  // Match stored media back to the four mandatory slots so a re-visit shows the
  // photos already taken rather than four empty boxes.
  const photos: VerificationPhoto[] = mandatoryPhotoSequence
    .map((step) => {
      const row = mediaRows.find((item) => item.category === step.category)
      if (!row) return null
      return {
        id: String(row.id),
        key: step.key as MandatoryPhotoKey,
        category: String(row.category),
        url: `/api/inspections/${encodeURIComponent(inspectionId)}/media/${encodeURIComponent(String(row.id))}`,
        capturedAt: row.captured_at ? String(row.captured_at) : null,
        latitude: typeof row.latitude === 'number' ? row.latitude : null,
        longitude: typeof row.longitude === 'number' ? row.longitude : null,
        contentHash: row.content_hash ? String(row.content_hash) : null,
      }
    })
    .filter((photo): photo is VerificationPhoto => photo !== null)

  const header = (
    <header className="inspector-topbar">
      <div>
        <div className="inspector-breadcrumb">
          <Link href="/inspector/field">الميدان</Link>
          <span>/</span>
          <strong>{inspection.vehicle.make} {inspection.vehicle.model}</strong>
        </div>
        <p className="inspector-topbar-description">{inspection.city}، {inspection.district}</p>
      </div>
      <div className="inspector-topbar-actions">
        <Link href="/inspector/field" className="inspector-secondary-link">
          <ArrowRight size={15} /> الطلبات
        </Link>
        <LogoutButton />
      </div>
    </header>
  )

  return (
    <FieldShell header={header}>
      <section className="inspector-detail-card">
        <div className="inspector-detail-card-heading">
          <div>
            <span className="inspector-section-kicker"><CarFront size={14} /> بيانات المركبة</span>
            <h1>{inspection.vehicle.make} {inspection.vehicle.model} {inspection.vehicle.year}</h1>
          </div>
          <span className={`field-chip ${claim ? 'is-ok' : 'is-warn'}`}>
            <ShieldCheck size={13} />
            {claim ? 'مسند إليك' : 'غير مسند'}
          </span>
        </div>

        <div className="field-order-facts">
          <div>
            <Gauge size={14} />
            <span>
              <small>الممشى المعلن</small>
              <strong>
                {inspection.vehicle.mileage !== null
                  ? `${new Intl.NumberFormat('ar-SA').format(inspection.vehicle.mileage)} كم`
                  : 'غير محدد'}
              </strong>
            </span>
          </div>
          <div>
            <CarFront size={14} />
            <span>
              <small>اللوحة</small>
              <strong dir="ltr">{inspection.vehicle.plateNumber || '—'}</strong>
            </span>
          </div>
          <div>
            <CalendarClock size={14} />
            <span>
              <small>الموعد</small>
              <strong>
                {new Intl.DateTimeFormat('ar-SA', { dateStyle: 'short', timeStyle: 'short' })
                  .format(new Date(inspection.scheduledAt))}
              </strong>
            </span>
          </div>
          <div>
            <MapPin size={14} />
            <span>
              <small>العنوان</small>
              <strong>{inspection.address || `${inspection.city}، ${inspection.district}`}</strong>
            </span>
          </div>
        </div>

        {inspection.notes && (
          <p className="inspector-checklist-disclaimer" style={{ marginTop: 12 }}>
            ملاحظات الطلب: {inspection.notes}
          </p>
        )}

        {!claim && (
          <p className="field-warning" style={{ marginTop: 12 }}>
            <AlertTriangle size={15} />
            هذا الطلب غير مسند إليك. ارجع إلى قائمة الطلبات واستلمه أولًا قبل التوثيق.
          </p>
        )}
      </section>

      <FieldVerification
        inspectionId={inspectionId}
        plateNumber={inspection.vehicle.plateNumber}
        initialOdometer={claim?.odometer_km ?? null}
        initialPlateConfirmed={claim?.plate_confirmed ?? false}
        initialPhotos={photos}
        required={Boolean(claim)}
      />

      <FieldEscalation
        inspectionId={inspectionId}
        claimId={claim?.id ?? null}
        city={inspection.city}
        hasClaim={Boolean(claim)}
        pendingHandover={pendingHandover}
      />

      <FieldAuditTrail actions={actions} chainLinked={chain.linked} />

      {chain.linked === false && chain.brokenAt !== null && (
        <section className="inspector-empty-panel">
          <span className="inspector-side-card-icon"><AlertTriangle size={19} /></span>
          <div>
            <h2>تنبيه سلامة السجل</h2>
            <p>
              السلسلة مكسورة عند الإجراء رقم {chain.brokenAt}. هذا يعني أن صفًا في السجل عُدّل أو حُذف بعد تسجيله.
              أبلغ الدعم فورًا ولا تكمل الفحص حتى تصل التوجيهات.
            </p>
          </div>
        </section>
      )}

      <section className="inspector-empty-panel">
        <span className="inspector-side-card-icon"><ShieldCheck size={19} /></span>
        <div>
          <h2>حدود التغطية</h2>
          <p>
            الاستلام متاح في: {SUPPORTED_CITIES.join('، ')}. {COMING_SOON_MESSAGE}.
          </p>
        </div>
      </section>
    </FieldShell>
  )
}
