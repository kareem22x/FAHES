import type { InspectionStatus, PaymentStatus } from './status'

/**
 * أنواع البيانات — مرآة لـ`StoredInspection` في `lib/inspection-store.ts`.
 *
 * ── لماذا نسخة لا استيراد ─────────────────────────────────────────────────
 *
 * `lib/inspection-store.ts` يستورد `@/lib/supabase/server` (عميل بمفتاح
 * الخدمة) — كود خادم لا يعمل في React Native، واستيراد النوع منه يجرّه إلى
 * الحزمة. فالنوع منسوخ، و**مصدر الحقيقة يبقى ملف الويب**.
 *
 * ⚠️ أي حقل يُضاف هناك يجب أن يُضاف هنا، وإلا وصل سرًّا وظهر `undefined` في
 * الواجهة بلا خطأ ترجمة (JSON لا يحمل نوعًا).
 */

/** عرض فاحص على طلب. */
export type InspectionOffer = {
  id: string
  inspectorId: string
  inspectorName: string
  /** بالريال — الوحدات الكبرى، مطابق لـ`payment_amount`. */
  price: number
  note: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: number
}

export type Vehicle = {
  make: string
  model: string
  year: number
  mileage: number | null
  color: string
  vin: string
  plateNumber: string
}

/** طلب فحص كما يعيده `GET /api/customer/requests`. */
export type CustomerRequest = {
  id: string
  customerId: string
  vehicle: Vehicle
  city: string
  district: string
  address: string
  services: string[]
  scheduledAt: string
  notes: string
  status: InspectionStatus
  assignedInspectorId: string | null
  acceptedOfferId: string | null
  /** بُعد موازٍ لـ`status` لا جزء منه. */
  paymentStatus: PaymentStatus
  paymentId: string | null
  paymentAmount: number | null
  paymentCurrency: string
  paymentMethod: string | null
  paymentFailureReason: string | null
  paidAt: string | null
  offers: InspectionOffer[]
  createdAt: number
}

/** جسم استجابة `GET /api/customer/requests`. */
export type CustomerRequestsResponse = {
  requests: CustomerRequest[]
}

/** العرض المقبول لطلب، أو `null` إن لم يُختر فاحص بعد. */
export function acceptedOffer(request: CustomerRequest): InspectionOffer | null {
  if (!request.acceptedOfferId) return null
  return request.offers.find((offer) => offer.id === request.acceptedOfferId) ?? null
}

/** وصف مختصر للسيارة — يُستخدم في القوائم. */
export function vehicleLabel(vehicle: Vehicle): string {
  const parts = [vehicle.make, vehicle.model].filter((part) => part && part.trim())
  return parts.length ? parts.join(' ') : 'سيارة'
}
