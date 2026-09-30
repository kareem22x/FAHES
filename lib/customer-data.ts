import { cache } from 'react'
import { listCustomerInspections, type StoredInspection } from '@/lib/inspection-store'
import { isActiveStatus } from '@/lib/inspection-status'
import { getSupabaseAdmin } from '@/lib/supabase/server'

/**
 * One Supabase round-trip per request even though the dashboard layout and the
 * page inside it both need the customer's requests.
 */
export const getCustomerRequests = cache(async (customerId: string): Promise<StoredInspection[]> => {
  return listCustomerInspections(customerId)
})

/**
 * IDs of completed requests whose report the inspector already submitted, so
 * "تقاريري" never links to a report that does not exist yet.
 */
export const getSubmittedReportIds = cache(async (customerId: string): Promise<string[]> => {
  const requests = await getCustomerRequests(customerId)
  const completedIds = requests.filter((request) => request.status === 'completed').map((request) => request.id)
  if (completedIds.length === 0) return []

  const { data, error } = await getSupabaseAdmin()
    .from('inspection_reports')
    .select('inspection_id')
    .in('inspection_id', completedIds)
    .not('submitted_at', 'is', null)
  if (error) throw new Error(`Supabase inspection report lookup failed: ${error.message}`)
  return (data ?? []).map((row) => row.inspection_id)
})

export function summarizeRequests(requests: StoredInspection[]) {
  const active = requests.filter((request) => isActiveStatus(request.status))
  return {
    total: requests.length,
    active: active.length,
    awaitingOffers: requests.filter((request) => request.status === 'open').length,
    completed: requests.filter((request) => request.status === 'completed').length,
    cancelled: requests.filter((request) => request.status === 'cancelled').length,
    pendingOffers: requests.reduce(
      (sum, request) => sum + (request.status === 'open' ? request.offers.length : 0),
      0,
    ),
  }
}
