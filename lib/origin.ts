import { NextRequest, NextResponse } from 'next/server'

export function assertSameOrigin(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null
  }

  const host = request.headers.get('host')
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  const allowed = (value: string | null) => {
    if (!value || !host) return false
    try {
      return new URL(value).host === host
    } catch {
      return false
    }
  }

  if (origin) {
    if (!allowed(origin)) {
      return NextResponse.json({ error: 'طلب غير مصرح' }, { status: 403 })
    }
    return null
  }

  const site = request.headers.get('sec-fetch-site')
  if (site === 'same-origin') return null

  if (referer && allowed(referer)) return null

  return NextResponse.json({ error: 'طلب غير مصرح' }, { status: 403 })
}
