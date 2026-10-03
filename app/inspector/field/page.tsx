import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, CarFront, FileText, Hash, MapPin, ShieldCheck, Wallet } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { FieldShell } from '@/components/modules/inspector/field/field-shell'
import { FieldDashboardClient } from '@/components/modules/inspector/field/field-dashboard-client'
import { ExitInspectorView } from '@/components/modules/inspector/field/exit-inspector-view'
import { requireRoles } from '@/lib/auth'
import { listOpenInspectionsForInspector, listCompletedInspectionsForInspector } from '@/lib/inspection-store'
import { listInspectorBadges, listSupportTickets } from '@/lib/field/store'
import { buildFieldAnalytics, buildWalletFromInspections } from '@/lib/field/analytics'
import { COMING_SOON_MESSAGE, SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import type { FieldOrderWithClaim, SupportTicket } from '@/lib/field/types'
import { getUserById } from '@/lib/user-store'

export const metadata: Metadata = {
  title: 'لوحة الفاحص الميداني',
  description: 'استلام الطلبات وتوثيق الفحوصات ميدانيًا في مدن المنطقة الشرقية.',
}

export const dynamic = 'force-dynamic'

/**
 * The field dashboard.
 *
 * Server-rendered because every number on it comes from a query the inspector
 * is not allowed to make themselves, and because the no-direct-communication
 * rule is enforced by *not selecting* the customer columns — a guarantee that
 * only holds if the data is fetched here rather than in the browser.
 *
 * The interactivity is delegated wholesale to `FieldDashboardClient`. That is
 * not a stylistic split: a server component cannot hand a callback to a client
 * component, so the handlers have to live on the client side of the boundary.
 * This page's job is to be honest about what data exists.
 *
 * A migration may not be applied yet. `listSupportTickets` / `listInspectorBadges`
 * degrade to empty in that case, and the panels say so rather than showing a
 * broken screen — the same posture the admin console takes.
 */
export default async function InspectorFieldDashboardPage() {
  const session = await requireRoles(['inspector'])
  const user = await getUserById(session.sub)
  const zones = user?.inspectorProfile?.cities ?? []
  const isOnline = user?.inspectorProfile?.isOnline ?? false

  // An owner wearing the inspector hat. They hold the surface (the guard in
  // `lib/field/access.ts` lets them act) but they have no approved coverage of
  // their own, so the *available orders* feed would be empty by definition.
  // Rather than show a dead screen, they get the whole city list the way the
  // field map expects it — and the header says plainly that they are in an
  // owner view, because every action they take is recorded against their name.
  const isOwnerView = session.inspectorView && session.role !== 'inspector'
  const feedZones = zones.length > 0 ? zones : [...SUPPORTED_CITIES]
  const zonesLabel = zones.length > 0 ? zones.join('، ') : 'مدن المنطقة الشرقية'

  const [openOrders, completed, badges, tickets] = await Promise.all([
    listOpenInspectionsForInspector(session.sub, feedZones),
    listCompletedInspectionsForInspector(session.sub),
    listInspectorBadges(session.sub),
    listSupportTickets(session.sub),
  ])

  // `listOpenInspectionsForInspector` already strips the customer identity.
  const orders: FieldOrderWithClaim[] = openOrders.map((order) => ({
    inspectionId: order.id,
    vehicle: {
      make: order.vehicle.make,
      model: order.vehicle.model,
      year: order.vehicle.year,
      color: order.vehicle.color,
      mileage: order.vehicle.mileage,
      plateNumber: order.vehicle.plateNumber,
    },
    city: order.city,
    district: order.district,
    address: order.address,
    services: order.services,
    scheduledAt: order.scheduledAt,
    notes: order.notes,
    status: order.status,
    distanceMeters: null,
    cityLatitude: null,
    cityLongitude: null,
    claim: null,
  }))

  // The wallet and analytics are computed here so the KPI row and the panels
  // cannot disagree with each other — one derivation, two renderers.
  //
  // The inspector-facing read strips the full offer list, keeping only the
  // inspector's own. That is the offer that was accepted for their work, so it
  // is the right price for the ledger.
  const payable = completed.map((inspection) => ({
    ...inspection,
    acceptedOffer: inspection.myOffer,
  }))

  const wallet = buildWalletFromInspections(payable)
  const analytics = buildFieldAnalytics(payable, 'month')

  const normalizedTickets: SupportTicket[] = tickets.map((ticket) => ({
    id: String(ticket.id),
    category: (ticket.category ?? 'other') as SupportTicket['category'],
    subject: String(ticket.subject ?? ''),
    body: String(ticket.body ?? ''),
    status: (ticket.status ?? 'open') as SupportTicket['status'],
    priority: (ticket.priority ?? 'normal') as SupportTicket['priority'],
    createdAt: String(ticket.created_at ?? new Date().toISOString()),
    updatedAt: String(ticket.updated_at ?? ticket.created_at ?? new Date().toISOString()),
    resolvedAt: ticket.resolved_at ? String(ticket.resolved_at) : null,
    resolutionNote: String(ticket.resolution_note ?? ''),
    inspectionId: ticket.inspection_id ? String(ticket.inspection_id) : null,
  }))

  const reportOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fahes.sa'

  const header = (
    <header className="inspector-topbar">
      <div>
        <div className="inspector-breadcrumb"><span>فاحص</span><span>/</span><strong>الميدان</strong></div>
        <p className="inspector-topbar-description">
          {isOwnerView
            ? `أنت في واجهة الفاحص بصلاحيات المالك. كل إجراء تسجّله هنا يُنسب إلى حسابك كفاحص لميدان ${zonesLabel}.`
            : `استلام الطلبات وتوثيق الفحوصات في ${zonesLabel}.`}
        </p>
      </div>
      <div className="inspector-topbar-actions">
        <span className={`inspector-status-pill ${isOnline ? 'is-online' : ''}`}>
          <span />{isOnline ? 'متاح للعمل' : 'غير متاح'}
        </span>
        {isOwnerView && <ExitInspectorView />}
        <LogoutButton />
      </div>
    </header>
  )

  return (
    <FieldShell header={header}>
      <section className="inspector-welcome">
        <div>
          <span className="inspector-section-kicker"><ShieldCheck size={14} /> لوحة الفاحص الميداني</span>
          <h1>مرحبًا، {user?.name || 'فاحص'}</h1>
          <p>
            {openOrders.length > 0
              ? `${openOrders.length} طلب متاح في مدنك. كل إجراء يُسجَّل بوقته وموقعك وبصمته الرقمية.`
              : 'لا توجد طلبات متاحة الآن. سيصلك تنبيه عند وصول طلب في مدنك.'}
          </p>
        </div>
        <span className="inspector-approved-badge"><ShieldCheck size={16} /> فاحص معتمد</span>
      </section>

      <div className="field-kpis" aria-label="ملخص اليوم">
        <div className="field-kpi">
          <span><CarFront size={14} /> طلبات متاحة</span>
          <strong>{openOrders.length}</strong>
          <small>في مدن تغطيتك</small>
        </div>
        <div className="field-kpi">
          <span><FileText size={14} /> فحوصات مكتملة</span>
          <strong>{completed.length}</strong>
          <small>تقارير موثّقة</small>
        </div>
        <div className="field-kpi">
          <span><Wallet size={14} /> صافي الرصيد</span>
          <strong>{new Intl.NumberFormat('ar-SA').format(Math.round(wallet.netBalance))}</strong>
          <small>ريال سعودي</small>
        </div>
        <div className="field-kpi">
          <span><Hash size={14} /> شارات مُحرَزة</span>
          <strong>{badges.length}</strong>
          <small>من أصل ستّ شارات</small>
        </div>
      </div>

      <section className="inspector-requests-section" aria-label="الخريطة الميدانية">
        <div className="inspector-requests-heading">
          <div>
            <span className="inspector-section-kicker"><MapPin size={14} /> الخريطة الميدانية</span>
            <h2>طلبات قريبة منك</h2>
          </div>
          <span className="inspector-section-count">{orders.length} طلب</span>
        </div>
      </section>

      {/*
        One client boundary for the whole interactive body. The KPI row above
        stays server-rendered so the page has meaningful content in the first
        paint, before any client JavaScript is parsed.
      */}
      <FieldDashboardClient
        orders={orders}
        inspections={payable}
        badges={badges.map((badge) => ({
          key: badge.badge_key,
          earnedAt: badge.earned_at,
          metricValue: badge.metric_value,
        }))}
        tickets={normalizedTickets}
        zones={zones}
        isOnline={isOnline}
        reportOrigin={reportOrigin}
        inspectorId={session.sub}
        completedIds={completed.map((inspection) => inspection.id)}
      />

      <section className="inspector-requests-section" aria-label="ملاحظة التغطية">
        <div className="inspector-empty-panel" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="inspector-side-card-icon"><ShieldCheck size={19} /></span>
          <div>
            <h2>حدود التغطية</h2>
            <p>
              الاستلام متاح في خمس مدن فقط: {SUPPORTED_CITIES.join('، ')}. أي طلب خارج هذه المدن يُرفض على الخادم
              مهما كانت الواجهة. {COMING_SOON_MESSAGE}.
            </p>
          </div>
        </div>
      </section>

      <section className="inspector-empty-panel">
        <span className="inspector-side-card-icon"><ShieldCheck size={19} /></span>
        <div>
          <h2>خصوصية العميل</h2>
          <p>
            لا تُعرض بيانات العميل ولا وسائل التواصل المباشر معه. التواصل يتم عبر المنصة فقط حفاظًا على الخصوصية
            ومنع التسويات خارج المنصة.
          </p>
        </div>
        <Link href="/inspector/dashboard" className="inspector-details-link">
          لوحة المكتب <ArrowLeft size={15} />
        </Link>
      </section>
    </FieldShell>
  )
}
