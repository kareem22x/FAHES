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
