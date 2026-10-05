import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getSupabaseAdmin, isMissingRelationError } from '@/lib/supabase/server'

/**
 * Admin view of one inspection report.
 *
 * The customer/inspector endpoint (`/api/inspections/[id]/report`) enforces
 * per-row ownership, so it can never serve a console operator. This route is
 * the console's read path instead: an elevated admin session (the same role
 * `requireAdminPage()` accepts — `admin_pending` is still sitting behind the
 * access-code gate and is refused here) may read the raw stored report.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const { id } = await context.params

  const { data, error } = await getSupabaseAdmin()
    .from('inspection_reports')
    .select('*')
    .eq('inspection_id', id)
    .maybeSingle()

  if (isMissingRelationError(error)) {
    return NextResponse.json({ error: 'جدول التقارير غير متاح' }, { status: 404 })
  }
  if (error) {
    console.error('Error loading admin inspection report:', error)
    return NextResponse.json({ error: 'تعذر تحميل التقرير حاليًا' }, { status: 503 })
  }
  if (!data) {
    return NextResponse.json({ error: 'لا يوجد تقرير لهذا الطلب' }, { status: 404 })
  }

  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
