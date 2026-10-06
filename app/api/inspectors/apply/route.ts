import type { NextRequest } from 'next/server'
import { handleInspectorIntake } from '@/lib/inspector-intake'

/**
 * Intake for a signed-in applicant who reached the questionnaire from
 * `/become-inspector` rather than through the sign-up wizard.
 *
 * All behaviour lives in `handleInspectorIntake`; this file declares only the
 * endpoint and its own rate-limit bucket.
 */
export async function POST(request: NextRequest) {
  return handleInspectorIntake(request, 'inspector-apply')
}
