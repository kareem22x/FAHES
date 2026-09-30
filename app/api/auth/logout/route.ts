import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError
  await clearSessionCookie()
  return NextResponse.json({ success: true })
}
