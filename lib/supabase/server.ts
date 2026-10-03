import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

let client: SupabaseClient<Database> | undefined

export class SupabaseConfigurationError extends Error {
  constructor() {
    super('Supabase server credentials are not configured')
    this.name = 'SupabaseConfigurationError'
  }
}

export class SupabaseMigrationRequiredError extends Error {
  constructor() {
    super('The optional Clerk phone migration has not been applied')
    this.name = 'SupabaseMigrationRequiredError'
  }
}

export class SupabaseInspectorApplicationsMigrationRequiredError extends Error {
  constructor() {
    super('The inspector applications migration has not been applied')
    this.name = 'SupabaseInspectorApplicationsMigrationRequiredError'
  }
}

/**
 * True when PostgREST reports that a relation does not exist in the database.
 *
 * Two different codes mean the same thing here:
 *   PGRST205 — the table is absent from PostgREST's schema cache (not migrated)
 *   42P01    — Postgres `undefined_table` (reached the database and it said no)
 *
 * Read paths use this to degrade to an empty result instead of throwing a 500.
 * A console that renders "no data yet" is strictly better than a crash, and the
 * caller can separately surface that a migration is still pending.
 */
export function isMissingRelationError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  return /could not find the table|relation .* does not exist|does not exist/i.test(error.message ?? '')
}

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) {
    throw new SupabaseConfigurationError()
  }

  if (!client) {
    client = createClient<Database>(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return client
}
