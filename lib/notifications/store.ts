import 'server-only'
import { getSupabaseAdmin, isMissingRelationError } from '@/lib/supabase/server'

/**
 * The inspector dashboard bell's data source.
 *
 * `notifications` arrives with migration 05. Every read degrades to an empty
 * result when the table is absent, so the dashboard renders normally on a
 * database that has not been migrated yet instead of throwing a 500.
 */

export type NotificationKind = 'request' | 'schedule' | 'report' | 'payment' | 'system' | 'support'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'

export type AppNotification = {
  id: string
  kind: NotificationKind
  severity: NotificationSeverity
  title: string
  body: string
  href: string | null
  readAt: number | null
  createdAt: number
}

type NotificationRow = {
  id?: string
  kind?: string
  severity?: string
  title?: string
  body?: string
  href?: string | null
  read_at?: string | null
  created_at?: string
}

const KINDS: NotificationKind[] = ['request', 'schedule', 'report', 'payment', 'system', 'support']
const SEVERITIES: NotificationSeverity[] = ['info', 'success', 'warning', 'critical']

function toNotification(row: NotificationRow): AppNotification | null {
  if (!row.id || !row.title) return null
  const kind = KINDS.includes(row.kind as NotificationKind) ? (row.kind as NotificationKind) : 'system'
  const severity = SEVERITIES.includes(row.severity as NotificationSeverity)
    ? (row.severity as NotificationSeverity)
    : 'info'
  return {
    id: row.id,
    kind,
    severity,
    title: row.title,
    body: row.body ?? '',
    href: row.href ?? null,
    readAt: row.read_at ? Date.parse(row.read_at) : null,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
  }
}

export async function listNotifications(userId: string, limit = 20): Promise<AppNotification[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('notifications')
    .select('id, kind, severity, title, body, href, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (isMissingRelationError(error)) return []
  if (error) throw new Error(`Supabase notifications read failed: ${error.message}`)

  return ((data ?? []) as NotificationRow[])
    .map(toNotification)
    .filter((item): item is AppNotification => item !== null)
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)

  if (isMissingRelationError(error)) return 0
  if (error) throw new Error(`Supabase notifications count failed: ${error.message}`)
  return count ?? 0
}

/** Marks every unread notification read. Returns how many rows changed. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id')

  if (isMissingRelationError(error)) return 0
  if (error) throw new Error(`Supabase notifications update failed: ${error.message}`)
  return (data ?? []).length
}

export async function markNotificationRead(userId: string, id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id)

  if (isMissingRelationError(error)) return false
  if (error) throw new Error(`Supabase notification update failed: ${error.message}`)
  return true
}
