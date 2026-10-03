import { NextRequest, NextResponse } from 'next/server'
import { resolveInspectorSession } from '@/lib/field/access'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { logAuditEvent } from '@/lib/audit'
import { createSupportTicket } from '@/lib/field/store'
import type { SupportTicketCategory } from '@/lib/field/types'

const categories: SupportTicketCategory[] = [
  'technical',
  'showroom_dispute',
  'location_mismatch',
  'payment',
  'safety',
  'account',
  'other',
]

const priorities = ['low', 'normal', 'high', 'urgent'] as const

/**
 * Field support intake. Separate from the admin inbox on purpose: a showroom
 * dispute needs the inspector's GPS and claim context attached at the moment
 * it is raised, which is information the admin console cannot reconstruct
 * afterwards.
 */
export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await resolveInspectorSession()
  if (!session) {
    return NextResponse.json({ error: 'هذه العملية للفاحص المعتمد فقط' }, { status: 401 })
  }

  const rateLimitResponse = await enforceApiRateLimit(request, 'field-support', session.sub, {
    user: 20,
    ip: 60,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات التذكرة غير صالحة' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'بيانات التذكرة غير صالحة' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  if (typeof input.category !== 'string' || !categories.includes(input.category as SupportTicketCategory)) {
    return NextResponse.json({ error: 'تصنيف التذكرة غير صالح' }, { status: 400 })
  }
  if (typeof input.subject !== 'string' || input.subject.trim().length < 3 || input.subject.length > 200) {
    return NextResponse.json({ error: 'عنوان التذكرة مطلوب (٣ أحرف على الأقل)' }, { status: 400 })
  }
  const priority = typeof input.priority === 'string' && priorities.includes(input.priority as typeof priorities[number])
    ? (input.priority as typeof priorities[number])
    : 'normal'

  try {
    const ticket = await createSupportTicket({
      inspectorId: session.sub,
      inspectionId: typeof input.inspectionId === 'string' ? input.inspectionId : null,
      claimId: typeof input.claimId === 'string' ? input.claimId : null,
      category: input.category as SupportTicketCategory,
      subject: input.subject.trim(),
      body: typeof input.body === 'string' ? input.body.slice(0, 4000) : '',
      priority,
      latitude: typeof input.latitude === 'number' ? input.latitude : null,
      longitude: typeof input.longitude === 'number' ? input.longitude : null,
    })
    if (!ticket) {
      return NextResponse.json({ error: 'خدمة التذاكر غير مفعّلة على هذه البيئة' }, { status: 503 })
    }

    await logAuditEvent({
      actorId: session.sub,
      eventType: 'field.support_ticket',
      resourceType: 'support_ticket',
      resourceId: typeof ticket.id === 'string' ? ticket.id : null,
      metadata: {
        category: input.category,
        priority: String(priority),
        inspectionId: typeof input.inspectionId === 'string' ? input.inspectionId : null,
      },
    })

    return NextResponse.json({ status: 'ok', id: ticket.id })
  } catch (error) {
    console.error('Error creating support ticket:', error)
    return NextResponse.json({ error: 'تعذّر إرسال التذكرة' }, { status: 503 })
  }
}
