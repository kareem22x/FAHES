import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isInspectorSession, isPlatformOwnerSession } from '@/lib/field/inspector-access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { logAuditEvent } from '@/lib/audit'
import { isMobileUserAgent } from '@/lib/device-signature'
import { bindInspectorDevice } from '@/lib/inspector-device-store'
import { assertSameOrigin } from '@/lib/origin'

const HEX_64 = /^[0-9a-f]{64}$/

/**
 * Binds an approved inspector's account to the phone they are using.
 *
 * Field inspection is mobile-only, so a request from a desktop user agent is
 * rejected before it reaches the database. The client also reports its own
 * `isMobile` verdict, but the server re-derives it from the user agent header —
 * the client flag is only used to give a better error message.
 *
 * ── The owner exception ────────────────────────────────────────────────────
 *
 * A platform owner is not an inspector, so both this route's mobile-only rule
 * and the SQL function's `role <> 'inspector'` guard would reject them. Neither
 * rule is about them: the device lock binds a *phone* to an *inspector's account*
 * to stop one inspector working as another, and an owner reviewing the field
 * dashboard from a laptop is not that threat. They are therefore reported as
 * `verified` without a row being written — the lock stays armed for the real
 * roster, and the owner's own session remains auditable through the ordinary
 * `fahes_inspector_view` trail.
 *
 * Ownership is tested with `isPlatformOwnerSession` (env-listed identity),
 * deliberately **not** `isInspectorSession` / `isOwnerInspectorView` (owner *in
 * view mode*). The latter depends on the `fahes_inspector_view` cookie, which
 * only exists after the owner presses the toggle in `/admin`. An owner who opens
 * the dashboard directly by URL holds no such cookie, so keying this route on it
 * meant the page loaded while its own device check answered 403 — the exact
 * failure this exception exists to avoid.
 *
 * ── Ordering ───────────────────────────────────────────────────────────────
 *
 * The owner is resolved from the **plain** session first. `resolveInspectorSession()`
 * returns `null` unless `isInspectorSession()` passes, which for an owner without
 * the view cookie it does not — so calling it first answered 401 before the owner
 * branch below was ever reached, leaving the route unreachable for exactly the
 * person the exception was written for. Ownership is therefore established before
 * the inspector gate, and the inspector gate remains untouched for everyone else.
 */
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const ownerView = isPlatformOwnerSession(session)

  // A real inspector is admitted by `isInspectorSession` (role === 'inspector',
  // or an owner in view mode). Anything else — a customer, an admin mid-gate, or
  // an owner who is not on the inspector surface — is refused here.
  if (!ownerView && !isInspectorSession(session)) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const limited = await enforceApiRateLimit(request, 'inspector-device', session.sub, {
    user: 20,
    ip: 40,
    windowMs: 60_000,
  })
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }

  const { hash, label, platform } = body as {
    hash?: unknown
    label?: unknown
    platform?: unknown
  }

  if (typeof hash !== 'string' || !HEX_64.test(hash)) {
    return NextResponse.json({ error: 'بصمة الجهاز غير صالحة' }, { status: 400 })
  }

  const userAgent = request.headers.get('user-agent') ?? ''
  if (!isMobileUserAgent(userAgent) && !ownerView) {
    await logAuditEvent({
      actorId: session.sub,
      eventType: 'inspector.device_rejected',
      resourceType: 'user',
      resourceId: session.sub,
      metadata: { reason: 'desktop_user_agent' },
    })
    return NextResponse.json(
      { error: 'تطبيق الفاحص يعمل على الجوال فقط. افتح الرابط من جوالك.' },
      { status: 403 },
    )
  }

  // The owner is not an inspector, so there is nothing to bind and the SQL
  // function would answer `not_inspector`. Report success and stop here.
  if (ownerView) {
    return NextResponse.json({ status: 'verified', deviceId: null, ownerView: true })
  }

  const result = await bindInspectorDevice(session.sub, {
    hash,
    label: typeof label === 'string' ? label : '',
    platform: typeof platform === 'string' ? platform : '',
    userAgent,
  })

  if (result.status === 'device_mismatch') {
    await logAuditEvent({
      actorId: session.sub,
      eventType: 'inspector.device_mismatch',
      resourceType: 'user',
      resourceId: session.sub,
      metadata: { boundLabel: result.boundLabel },
    })
    return NextResponse.json(
      {
        error: `هذا الحساب مربوط بجهاز آخر (${result.boundLabel}). تواصل مع الإدارة لفكّ الارتباط.`,
        code: 'device_mismatch',
      },
      { status: 403 },
    )
  }

  if (result.status === 'not_inspector') {
    return NextResponse.json({ error: 'الحساب غير معتمد كفاحص.' }, { status: 403 })
  }

  if (result.status === 'invalid') {
    return NextResponse.json({ error: 'بصمة الجهاز غير صالحة' }, { status: 400 })
  }

  if (result.status === 'migration_required') {
    // The device-lock migration is missing. Refuse rather than pretend the
    // check passed, and say exactly what an operator has to run.
    return NextResponse.json(
      {
        error: 'قفل الأجهزة غير مُهيّأ على قاعدة البيانات. يلزم تشغيل ملف الترحيل 20261001120000_inspector_device_lock.sql.',
        code: 'migration_required',
      },
      { status: 503 },
    )
  }

  if (result.status === 'bound') {
    await logAuditEvent({
      actorId: session.sub,
      eventType: 'inspector.device_bound',
      resourceType: 'user',
      resourceId: session.sub,
      metadata: { label: typeof label === 'string' ? label : '', platform: String(platform ?? '') },
    })
  }

  return NextResponse.json({ success: true, status: result.status })
}
