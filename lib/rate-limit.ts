import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'
import { hmacHex } from '@/lib/web-crypto'

function getPepper() {
  const pepper = process.env.RATE_LIMIT_PEPPER
  if (!pepper || pepper.length < 32) {
    throw new Error('RATE_LIMIT_PEPPER must contain at least 32 characters')
  }
  return pepper
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const bucketHash = await hmacHex(getPepper(), key)
  const { data, error } = await getSupabaseAdmin().rpc('consume_rate_limit', {
    p_bucket_hash: bucketHash,
    p_limit: limit,
    p_window_ms: windowMs,
  })
  if (error) throw new Error(`Supabase rate-limit operation failed: ${error.message}`)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase returned an invalid rate-limit result')
  }
  const result = data as { [key: string]: Json | undefined }
  if (typeof result.ok !== 'boolean' || typeof result.retryAfterSec !== 'number') {
    throw new Error('Supabase returned an invalid rate-limit result')
  }
  return { ok: result.ok, retryAfterSec: result.retryAfterSec }
}
