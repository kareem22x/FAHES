export const inspectionTermsVersion = '2026-10-v1'

export type CreateInspectionPayload = {
  vehicle: {
    make: string
    model: string
    year: number
    mileage: number | null
    color: string
    vin: string
    plateNumber: string
  }
  city: string
  district: string
  address: string
  services: string[]
  scheduledAt: string
  notes: string
  termsAccepted: true
  termsVersion: typeof inspectionTermsVersion
}
