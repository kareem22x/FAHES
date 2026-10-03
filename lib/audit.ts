import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'

export type AuditEventInput = {
  /** `user_profiles.id`, or null for anonymous/system actors. */
  actorId: string | null
  eventType: string
  resourceType: string
  resourceId?: string | null
  metadata?: Record<string, Json>
}

/**
 * Writes to the append-only `audit_events` table.
 *
 * The table has a BEFORE UPDATE/DELETE trigger that raises, so rows written
 * here cannot be altered or removed afterwards — not even by the service role.
 *
 * Auditing must never take down the request it is describing, so failures are
 * reported to the server log and swallowed. Callers that need to know whether
 * the trail was written get the boolean back.
 */
export async function logAuditEvent(event: AuditEventInput): Promise<boolean> {
  try {
    const { error } = await getSupabaseAdmin().from('audit_events').insert({
      actor_id: event.actorId,
      event_type: event.eventType,
      resource_type: event.resourceType,
      resource_id: event.resourceId ?? null,
      metadata: (event.metadata ?? {}) as Json,
    })
    if (error) throw new Error(error.message)
    return true
  } catch (error) {
    console.error(`audit_event_failed:${event.eventType}`, error)
    return false
  }
}
