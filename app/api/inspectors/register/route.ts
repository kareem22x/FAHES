import type { NextRequest } from 'next/server'
import { handleInspectorIntake } from '@/lib/inspector-intake'

/**
 * Intake for the sign-up wizard at `/inspector-signup`.
 *
 * The Clerk account is created in the browser before this is called, so by the
 * time the request lands there is a session and the flow is identical to
 * `/api/inspectors/apply`. The two keep separate rate-limit buckets so a burst
 * on one cannot exhaust the other.
 */
export async function POST(request: NextRequest) {
  return handleInspectorIntake(request, 'inspector-register')
}
