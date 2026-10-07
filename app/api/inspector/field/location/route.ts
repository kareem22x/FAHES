import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { reportInspectorLocation, type LocationStatus } from '@/lib/field/location'

/**
 * Where an inspector's position lands.
 *
 * The field surface calls this on a timer, so two properties matter more than
 * throughput: it must be cheap, and it must never be the reason a screen fails.
 * Everything that could throw for a mundane reason is answered with a JSON body
 * the client can act on rather than a 5xx it would only retry.
 *
 * The trust question — is this fix believable — is not answered here. The route
 * validates that the payload is well-formed and belongs to the caller; the
 * verdict is computed in `lib/field/location.ts` against stored state, which a
 * client cannot reach.
 */

const ALLOWED_STATUSES: readonly LocationStatus[] = ['available', 'en_route', 'inspecting', 'offline']

/** Beyond this, the browser is not reporting a position, it is reporting a fault. */
const MAX_ACCURACY_M = 100_000

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json({ error: 'هذه العملية للفاحص المعتمد فقط' }, { status: 401 })
  }

  // A 30-second reporter is 120 calls an hour. The ceiling leaves room for a
  // retry storm on a flapping connection without letting one device flood.
  const rateLimitResponse = await enforceApiRateLimit(request, 'field-location', session.sub, {
    user: 300,
    ip: 600,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الموقع غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات الموقع غير صالحة' }, { status: 400 })
  }

  const input = body as Record<string, unknown>

  const latitude = finiteOrNull(input.latitude)
  const longitude = finiteOrNull(input.longitude)
  if (latitude === null || longitude === null || !inRange(latitude, -90, 90) || !inRange(longitude, -180, 180)) {
    return NextResponse.json({ error: 'إحداثيات غير صالحة' }, { status: 400 })
  }

  const accuracy = finiteOrNull(input.accuracy)
  if (accuracy !== null && (accuracy < 0 || accuracy > MAX_ACCURACY_M)) {
    return NextResponse.json({ error: 'دقة الموقع غير صالحة' }, { status: 400 })
  }

  const status = typeof input.status === 'string' ? (input.status as LocationStatus) : 'available'
  if (!ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'حالة الفاحص غير معروفة' }, { status: 400 })
  }

  // Normalised rather than rejected: heading and speed are decoration on the
  // map, and refusing a whole fix over a negative speed would lose the position.
  const heading = finiteOrNull(input.heading) ?? 0
  const speed = Math.max(0, finiteOrNull(input.speed) ?? 0)

  const batteryCandidate = finiteOrNull(input.batteryLevel)
  const batteryLevel =
    batteryCandidate === null ? null : Math.max(0, Math.min(100, Math.round(batteryCandidate)))

  try {
    const outcome = await reportInspectorLocation({
      inspectorId: session.sub,
      latitude,
      longitude,
      accuracy,
      heading: ((heading % 360) + 360) % 360,
      speed,
      status,
      batteryLevel,
    })

    if (outcome.status === 'unavailable') {
      // 200, not 503: the client reads `stored: false` and stops sending until
      // the page is reloaded, instead of retrying a missing table forever.
      return NextResponse.json({ success: true, stored: false, reason: 'migration_pending' })
    }

    return NextResponse.json({ success: true, stored: true, mock: outcome.mock, reason: outcome.reason })
  } catch (error) {
    console.error('Error recording inspector location:', error)
    return NextResponse.json({ error: 'تعذّر تسجيل الموقع حاليًا' }, { status: 503 })
  }
}
