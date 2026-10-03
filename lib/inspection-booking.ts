import { inspectionTermsVersion } from '@/types/booking'

export function isValidInspectionConsent(accepted: unknown, version: unknown): boolean {
  return accepted === true && version === inspectionTermsVersion
}
