import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/client-ip'
import { consumeRateLimit } from '@/lib/rate-limit'

export async function enforceApiRateLimit(
  request: NextRequest,
  operation: string,
  userId: string,
  limits: { user: number; ip: number; windowMs: number },
): Promise<NextResponse | null> {
  try {
    const [userLimit, ipLimit] = await Promise.all([
      consumeRateLimit(`${operation}:user:${userId}`, limits.user, limits.windowMs),
      consumeRateLimit(`${operation}:ip:${getClientIp(request)}`, limits.ip, limits.windowMs),
    ])
    if (userLimit.ok && ipLimit.ok) return null

    const retryAfterSec = Math.max(
      1,
      ...[userLimit, ipLimit].filter((result) => !result.ok).map((result) => result.retryAfterSec),
    )
    return NextResponse.json(
      { error: 'تم تجاوز الحد المسموح. حاول لاحقًا' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  } catch (error) {
    console.error(`Rate limiting failed for ${operation}:`, error)
    return NextResponse.json({ error: 'الخدمة غير متاحة حاليًا' }, { status: 503 })
  }
}
