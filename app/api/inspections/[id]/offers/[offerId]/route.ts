import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { acceptInspectionOffer } from '@/lib/inspection-store'
import { assertSameOrigin } from '@/lib/origin'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; offerId: string }> },
) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'customer') {
    return NextResponse.json({ error: 'يجب تسجيل الدخول كعميل' }, { status: 401 })
  }
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-offer-accept', session.sub, {
    user: 20,
    ip: 60,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const { id, offerId } = await context.params
  const result = await acceptInspectionOffer({ inspectionId: id, offerId, customerId: session.sub })
  if ('error' in result) {
    const status = result.error === 'not_found' || result.error === 'offer_not_found' ? 404 :
      result.error === 'forbidden' ? 403 : 409
    return NextResponse.json({ error: 'تعذر قبول العرض؛ ربما تم إسناد الطلب بالفعل' }, { status })
  }

  return NextResponse.json({ success: true, inspectorName: result.offer.inspectorName })
}
