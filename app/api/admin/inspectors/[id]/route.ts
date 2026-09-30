import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { setInspectorStatus } from '@/lib/user-store'
import type { InspectorStatus } from '@/lib/types'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  }

  const { id } = await context.params
  const body = await request.json()
  const status = body.status as InspectorStatus
  if (!['approved', 'rejected', 'suspended', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
  }

  const user = await setInspectorStatus(id, status, session.sub)
  if (!user) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
  return NextResponse.json({ success: true, user })
}
