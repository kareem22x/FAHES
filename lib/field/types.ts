/**
 * Domain types for the inspector field dashboard.
 *
 * These mirror the shapes the API routes return, so a component never has to
 * guess whether a timestamp is a string or a number. Anything that comes back
 * from Supabase as `timestamptz` is a string here; anything derived from
 * `Date.parse` is a number. Mixing the two is the single most common source of
 * "Invalid Date" in Arabic date formatting, so the split is deliberate.
 */

/** A single fix, as the browser reports it. Never partially filled. */
export type FieldFix = {
  latitude: number
  longitude: number
  /** Metres. `null` when the device does not report an accuracy. */
  accuracy: number | null
  /** Device clock at capture, RFC3339. */
  capturedAt: string
}

/**
 * A fix plus the state of the world around it. `stale` is set when the browser
 * handed back a cached position older than the freshness budget — an inspector
 * standing in a basement car park gets one of these and must be told.
 */
export type LocatedFix = FieldFix & {
  stale: boolean
  ageMs: number
}

export type FieldLocationState = {
  fix: LocatedFix | null
  status: 'idle' | 'requesting' | 'ready' | 'denied' | 'unsupported' | 'error'
  error: string | null
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export type ClaimStatus = 'claimed' | 'in_progress' | 'completed' | 'cancelled' | 'handed_over'

export type CancelReason =
  | 'vehicle_missing'
  | 'vehicle_sold'
  | 'showroom_denied'
  | 'location_mismatch'
  | 'safety_concern'
  | 'other'

export type FieldClaim = {
  id: string
  inspectionId: string
  inspectorId: string
  city: string
  status: ClaimStatus
  claimedAt: string
  claimLatitude: number | null
  claimLongitude: number | null
  claimAccuracy: number | null
  claimDistanceMeters: number | null
  odometerKm: number | null
  plateConfirmed: boolean
  verificationCompletedAt: string | null
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelReason: CancelReason | null
  cancelNote: string
  handedOverTo: string | null
}

/**
 * The order as the field inspector sees it.
 *
 * Note what is absent: customer name, customer phone, and any free-text contact
 * detail. The no-direct-communication rule is enforced at the query, not at the
 * component — a field that is never fetched cannot leak through a debug panel.
 */
export type FieldOrder = {
  inspectionId: string
  vehicle: {
    make: string
    model: string
    year: number
    color: string
    mileage: number | null
    plateNumber: string
  }
  city: string
  district: string
  /** Street-level address. Shown only once claimed. */
  address: string
  services: string[]
  scheduledAt: string
  notes: string
  status: string
  /** Straight-line distance from the inspector, in metres, when known. */
  distanceMeters: number | null
  cityLatitude: number | null
  cityLongitude: number | null
  /**
   * Set when the coordinates in use are the city centre rather than the
   * vehicle's own position. The UI shows these distances with an "≈" so an
   * inspector planning a route is not misled into thinking it is exact.
   */
  cityCentreApproximation?: boolean
}

export type FieldOrderWithClaim = FieldOrder & {
  claim: FieldClaim | null
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type FieldActionType =
  | 'claim'
  | 'verify'
  | 'start'
  | 'status_change'
  | 'media_upload'
  | 'media_delete'
  | 'report_save'
  | 'report_submit'
  | 'cancel'
  | 'handover_request'
  | 'handover_accept'
  | 'sync'
  | 'note'

/** The exact content that gets hashed. Kept in one place so tests can pin it. */
export type FieldActionContent = {
  claimId: string
  inspectionId: string
  inspectorId: string
  actionType: FieldActionType
  actionDetail: string
  recordedAtRfc3339: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  payload: Record<string, unknown>
  prevHash: string
}

/**
 * A stored action. `prevHash` and `payload` come from `FieldActionContent`;
 * `id`, `contentHash` and `createdAt` are assigned by the database.
 */
export type FieldAction = Omit<FieldActionContent, 'prevHash'> & {
  id: number
  prevHash: string
  contentHash: string
  deviceMonotonicMs: number | null
  offlineQueued: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Offline queue
// ---------------------------------------------------------------------------

export type QueuedAction = {
  /** Client-generated so a retry can be de-duplicated server-side. */
  localId: string
  content: FieldActionContent
  hash: string
  attempts: number
  lastError: string | null
  queuedAt: string
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * The four mandatory shots. Ordered because the order is the legal sequence:
 * you photograph the vehicle, then the signboard that places it, then the
 * paperwork that describes it, then the odometer that dates it.
 */
export const mandatoryPhotoSequence = [
  { key: 'vehicle_full', category: 'المركبة كاملة', label: 'صورة المركبة كاملة', hint: 'أربع زوايا أو زاوية واحدة واضحة للسيارة بالكامل' },
  { key: 'showroom_sign', category: 'لوحة المعرض', label: 'لوحة المعرض أو المعرض', hint: 'لوحة اسم المعرض أو واجهته مع السيارة' },
  { key: 'inspection_paper', category: 'تقرير الفحص', label: 'تقرير الفحص الورقي أو الرقمي', hint: 'المستند الرسمي للفحص إن وُجد' },
  { key: 'odometer', category: 'لوحة العدادات', label: 'لوحة العدادات', hint: 'عدّاد الكيلومترات واضحًا مع تشغيل المركبة' },
] as const

export type MandatoryPhotoKey = (typeof mandatoryPhotoSequence)[number]['key']

export type VerificationPhoto = {
  id: string
  key: MandatoryPhotoKey
  category: string
  url: string
  capturedAt: string | null
  latitude: number | null
  longitude: number | null
  contentHash: string | null
}

// ---------------------------------------------------------------------------
// Support / handover / badges / payouts / analytics
// ---------------------------------------------------------------------------

export type SupportTicketCategory =
  | 'technical'
  | 'showroom_dispute'
  | 'location_mismatch'
  | 'payment'
  | 'safety'
  | 'account'
  | 'other'

export type SupportTicket = {
  id: string
  category: SupportTicketCategory
  subject: string
  body: string
  status: 'open' | 'in_review' | 'resolved' | 'closed'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  resolutionNote: string
  inspectionId: string | null
}

export type HandoverRequest = {
  id: string
  claimId: string
  inspectionId: string
  city: string
  reason: 'emergency' | 'vehicle_unavailable' | 'showroom_denied' | 'safety' | 'other'
  note: string
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
  createdAt: string
  expiresAt: string
  /** Present on the incoming side: who is handing the job over and why. */
  fromInspectorName?: string
  vehicleLabel?: string
}

export type BadgeKey =
  | 'reliable'
  | 'fastest_responder'
  | 'century_club'
  | 'zero_cancellations'
  | 'documentation_ace'
  | 'veteran'

export type InspectorBadge = {
  key: BadgeKey
  label: string
  description: string
  icon: 'shield' | 'zap' | 'award' | 'check' | 'camera' | 'medal'
  earnedAt: string
  metricValue: number | null
}

export type WalletEntry = {
  id: string
  inspectionId: string
  vehicleLabel: string
  amount: number
  status: 'pending' | 'available' | 'requested' | 'paid'
  completedAt: string
}

export type WalletSummary = {
  netBalance: number
  availableBalance: number
  pendingBalance: number
  requestedBalance: number
  lifetimeTotal: number
  entries: WalletEntry[]
  /** The last payout request, if any, so the screen can show its state. */
  lastPayoutRequestAt: string | null
}

export type AnalyticsRange = 'week' | 'month'

export type AnalyticsPoint = {
  label: string
  completed: number
  cancelled: number
  averageMinutes: number | null
}

export type FieldAnalytics = {
  range: AnalyticsRange
  completed: number
  cancelled: number
  completionRate: number
  averageTurnaroundMinutes: number | null
  approvalRate: number | null
  verifiedInspections: number
  series: AnalyticsPoint[]
}

// ---------------------------------------------------------------------------
// Field preferences (dark mode / battery saver)
// ---------------------------------------------------------------------------

export type FieldPreferences = {
  /**
   * Dark mode ships **enabled** because the spec asks for it, but the two
   * battery-protection switches ship off: they are a deployment-time decision
   * for field conditions, not something to surprise an inspector with.
   */
  darkMode: boolean
  batterySaver: boolean
  audioAlerts: boolean
  haptics: boolean
}

export const defaultFieldPreferences: FieldPreferences = {
  darkMode: true,
  batterySaver: false,
  audioAlerts: true,
  haptics: true,
}
