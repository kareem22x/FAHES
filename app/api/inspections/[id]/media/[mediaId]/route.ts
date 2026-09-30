import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { deleteInspectionMedia } from '@/lib/inspection-report-store'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; mediaId: string }> },
) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'inspector') {
    return NextResponse.json({ error: 'حذف الصور متاح للفاحص المسند إليه الطلب فقط' }, { status: 401 })
  }
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-media-delete', session.sub, {
    user: 60,
    ip: 120,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { id, mediaId } = await context.params
    const result = await deleteInspectionMedia({
      inspectionId: id,
      inspectorId: session.sub,
      mediaId,
    })
    if ('error' in result) {
      const statusCode = result.error === 'not_found' ? 404 : result.error === 'forbidden' ? 403 :
        result.error === 'closed' ? 409 : 400
      return NextResponse.json({ error: 'تعذر حذف الملف من الطلب' }, { status: statusCode })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error deleting inspection media:', error)
    return NextResponse.json({ error: 'تعذر حذف الملف حاليًا' }, { status: 503 })
  }
}
