import { sha256Hex, timingSafeEqual } from '@/lib/web-crypto'

export async function verifyAdminAccessCode(code: string) {
  const expected = process.env.ADMIN_ACCESS_CODE
  if (!expected) return false
  const [left, right] = await Promise.all([sha256Hex(code.trim()), sha256Hex(expected)])
  return timingSafeEqual(left, right)
}
