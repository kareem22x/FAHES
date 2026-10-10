import { NextResponse } from 'next/server'

import { buildFieldAnalytics, buildWalletFromInspections } from '@/lib/field/analytics'
import { resolveInspectorSession } from '@/lib/field/access'
import { listInspectorBadges, listSupportTickets } from '@/lib/field/store'
import {
  listAssignedInspectionsForInspector,
  listCompletedInspectionsForInspector,
  listOpenInspectionsForInspector,
} from '@/lib/inspection-store'
import { SUPPORTED_CITIES } from '@/lib/locations/saudi-cities'
import { getUserById } from '@/lib/user-store'

/**
 * لوحة الفاحص الميداني — قراءة فقط، عبر الشبكة.
 *
 * ── لماذا مسار جديد ───────────────────────────────────────────────────────
 *
 * لوحة `/inspector/field` على الويب **مكوّن خادم**: تقرأ القاعدة بنفسها
 * (`listOpenInspectionsForInspector` · `buildWalletFromInspections` ·
 * `listInspectorBadges` · `listSupportTickets`) ولا تنادي أي API. وتطبيق
 * الجوال لا يستطيع ذلك: ترحيل `rls_deny_by_default` يسحب كل صلاحية من
 * `anon` و`authenticated` على `inspections` — فالخادم وحده يقرأ.
 *
 * ── لماذا هو رقيق ─────────────────────────────────────────────────────────
 *
 * لا حساب هنا. كل رقم يأتي من الدوال نفسها التي تستدعيها صفحة الويب، وبنفس
 * الترتيب: `payable` ثم `buildWalletFromInspections` ثم `buildFieldAnalytics`.
 * لو حسبنا الرصيد هنا لصار عندنا مصدران — وتطبيق يقول للفاحص رقمًا ويقول له
 * الموقع رقمًا آخر. المصدر واحد: `lib/field/analytics.ts`.
 *
 * ── ⚠️ الشكل المُعاد مُنتقى لا منسوخ ────────────────────────────────────────
 *
 * الصفوف الخام (`InspectionRow`) تحمل حقولًا لا تخصّ الفاحص، وبثّها كما هي
 * يُقحم في الحزمة حقولًا قد تُضاف غدًا بلا انتباه. فالحقول المذكورة هنا هي
 * **العقد** — وما ليس مذكورًا لا يصل، ولو أُضيف إلى الجدول.
 *
 * ── المالك في واجهة الفاحص ────────────────────────────────────────────────
 *
 * `resolveInspectorSession` تُدخل المالك على الملكية وحدها (انظر المبرّر في
 * `lib/field/inspector-access.ts`). لكن `getUserById` لا يحمل ملفًا ميدانيًّا
 * له، فمدن تغطيته فارغة ⇒ قائمة الطلبات المتاحة فارغة **بحكم التعريف** لا
 * بحكم عطب. الصفحة على الويب تعالج ذلك بعرض كل المدن؛ ونفعلها هنا أيضًا، مع
 * `isOwnerView` ليعرف التطبيق أن يعرض تنبيهًا صريحًا.
 *
 * ── GET فقط ───────────────────────────────────────────────────────────────
 *
 * كل إجراء ميداني (استلام، تحقّق، رفع، إغلاق) له مسار POST قائم بحدّ معدّل
 * وبصمة سلسلة. لا نكرّره هنا: هذا المسار للقراءة وحدها، ولذلك لا
 * `assertSameOrigin` (الفحص يتخطّى GET أصلًا — لا يغيّر حالة).
 */
type FeedItem = Awaited<ReturnType<typeof listOpenInspectionsForInspector>>[number]

/**
 * عنصر الطلب في اللوحة — مفتاح واحد لكل قائمة، فمتاحُ المزايدة ومسندُ العمل
 * صفّان من نفس الجدول ويرسمهما نفس البطاقات.
 *
 * `myOfferPrice` هو سعر عرض هذا الفاحص على الطلب (null إن لم يقدّم بعد) — وهو
 * ما تحتاجه البطاقة لتقول «عرضك ٢٥٠ ر.س بانتظار رد العميل» بدل أن تُخفي أن
 * العرض أُرسل. قائمة عروض الزملاء لا تُرسل أبدًا: لا يرى فاحص ما عرضه آخر.
 */
function toFeedItem(order: FeedItem) {
  return {
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
    myOfferPrice: order.myOffer?.price ?? null,
  }
}
export async function GET() {
  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json(
      { error: 'هذه اللوحة للفاحص المعتمد فقط.', reason: 'forbidden' },
      { status: 403 },
    )
  }

  try {
    const user = await getUserById(session.sub)
    const zones = user?.inspectorProfile?.cities ?? []
    const isOnline = user?.inspectorProfile?.isOnline ?? false
    const isOwnerView = session.role !== 'inspector'

    // مالك بلا تغطية ⇒ نعرض كل المدن كما تفعل صفحة الويب، بدل شاشة ميتة.
    const feedZones = zones.length > 0 ? zones : [...SUPPORTED_CITIES]

    const [openOrders, assignedOrders, completed, badges, tickets] = await Promise.all([
      listOpenInspectionsForInspector(session.sub, feedZones),
      listAssignedInspectionsForInspector(session.sub),
      listCompletedInspectionsForInspector(session.sub),
      listInspectorBadges(session.sub),
      listSupportTickets(session.sub),
    ])

    // `acceptedOffer: inspection.myOffer` — نفس التوليف في صفحة الويب، وهو
    // العرض المقبول لعمله، أي السعر الصحيح في السجل.
    const payable = completed.map((inspection) => ({
      ...inspection,
      acceptedOffer: inspection.myOffer,
    }))

    const wallet = buildWalletFromInspections(payable)
    const analytics = buildFieldAnalytics(payable, 'month')

    return NextResponse.json({
      inspector: {
        name: user?.name ?? null,
        cities: zones,
        coverageLabel: zones.length > 0 ? zones.join('، ') : 'مدن المنطقة الشرقية',
        isOnline,
        isOwnerView,
      },
      orders: openOrders.map(toFeedItem),
      // «الفحوصات المسندة» التي ترسمها صفحة `inspector/dashboard` (`#assigned`):
      // لا مسار آخر يعيدها، وتطبيق الجوال لا يقرأ القاعدة مباشرة — فبلا هذا
      // الحقل لا يملك الفاحص في الجوال عملًا يفتحه أصلًا.
      assigned: assignedOrders.map(toFeedItem),
      wallet: {
        netBalance: wallet.netBalance,
        availableBalance: wallet.availableBalance,
        pendingBalance: wallet.pendingBalance,
        requestedBalance: wallet.requestedBalance,
        lifetimeTotal: wallet.lifetimeTotal,
        lastPayoutRequestAt: wallet.lastPayoutRequestAt,
        // السجل مُنتقى: هو ما ترسمه شاشة المحفظة لا أكثر.
        entries: wallet.entries.map((entry) => ({
          id: entry.id,
          inspectionId: entry.inspectionId,
          vehicleLabel: entry.vehicleLabel,
          amount: entry.amount,
          status: entry.status,
          completedAt: entry.completedAt,
        })),
      },
      analytics: {
        range: analytics.range,
        completed: analytics.completed,
        cancelled: analytics.cancelled,
        completionRate: analytics.completionRate,
        averageTurnaroundMinutes: analytics.averageTurnaroundMinutes,
        approvalRate: analytics.approvalRate,
        verifiedInspections: analytics.verifiedInspections,
      },
      badges: badges.map((badge) => ({
        key: badge.badge_key,
        earnedAt: badge.earned_at,
        metricValue: badge.metric_value,
      })),
      tickets: tickets.map((ticket) => ({
        id: String(ticket.id),
        subject: String(ticket.subject ?? ''),
        status: String(ticket.status ?? 'open'),
        priority: String(ticket.priority ?? 'normal'),
        createdAt: String(ticket.created_at ?? ''),
      })),
    })
  } catch (error) {
    // لا نُسرّب رسالة القاعدة؛ تُسجَّل هنا وتُعرض رسالة عامة.
    console.error('[inspector:field] failed to load dashboard', {
      inspectorId: session.sub,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'تعذّر تحميل لوحة الميدان الآن. أعد المحاولة.', reason: 'load_failed' },
      { status: 502 },
    )
  }
}
