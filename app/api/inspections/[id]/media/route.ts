import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { assertSameOrigin } from '@/lib/origin'
import { maxInspectionMediaBytes, uploadInspectionMedia } from '@/lib/inspection-report-store'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'inspector') {
    return NextResponse.json({ error: 'رفع الصور متاح للفاحص المسند إليه الطلب فقط' }, { status: 401 })
  }
  const rateLimitResponse = await enforceApiRateLimit(request, 'inspection-media-upload', session.sub, {
    user: 40,
    ip: 80,
    windowMs: 60 * 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > maxInspectionMediaBytes + 64 * 1024) {
    return NextResponse.json({ error: 'حجم الملف يتجاوز الحد المسموح (10 ميغابايت)' }, { status: 413 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'تعذر قراءة الملف المرفق' }, { status: 400 })
  }
  const file = form.get('file')
  const category = form.get('category')
  if (!(file instanceof File) || typeof category !== 'string') {
    return NextResponse.json({ error: 'أرفق ملفًا واختر تصنيفه' }, { status: 400 })
  }

  try {
    const { id } = await context.params
    const result = await uploadInspectionMedia({
      inspectionId: id,
      inspectorId: session.sub,
      file,
      category,
    })
    if ('error' in result) {
      const statusCode = result.error === 'not_found' ? 404 : result.error === 'forbidden' ? 403 :
        result.error === 'closed' ? 409 : 400
      return NextResponse.json({ error: 'الملف غير صالح أو أن الطلب لم يعد قابلًا للتعديل' }, { status: statusCode })
    }
    return NextResponse.json({ success: true, media: result }, { status: 201 })
  } catch (error) {
    console.error('Error uploading inspection media:', error)
    return NextResponse.json({ error: 'تعذر حفظ الملف بأمان حاليًا' }, { status: 503 })
  }
}
