export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type UserProfileRow = {
  id: string
  clerk_user_id: string | null
  phone: string | null
  name: string
  role: 'customer' | 'inspector' | 'admin'
  inspector_status: 'none' | 'pending' | 'approved' | 'rejected' | 'suspended'
  inspector_cities: string[]
  is_online: boolean
  inspector_profile_updated_at: string | null
  created_at: string
  last_login_at: string
}

export type InspectionRow = {
  id: string
  customer_id: string
  vehicle: Json
  city: string
  district: string
  address: string
  services: string[]
  scheduled_at: string
  notes: string
  terms_version: string | null
  terms_accepted_at: string | null
  status: 'open' | 'assigned' | 'on_the_way' | 'arrived' | 'inspecting' | 'completed' | 'cancelled'
  assigned_inspector_id: string | null
  accepted_offer_id: string | null
  created_at: string
}

export type InspectionMediaRow = {
  id: string
  inspection_id: string
  inspector_id: string
  object_path: string
  media_type: 'image' | 'video' | 'document'
  mime_type: string
  file_size: number
  category: string
  original_filename: string
  created_at: string
}

export type InspectionOfferRow = {
  id: string
  inspection_id: string
  inspector_id: string
  inspector_name: string
  price: number
  note: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export type InspectorDeviceRow = {
  id: string
  inspector_id: string
  device_hash: string
  device_label: string
  platform: string
  user_agent: string
  first_seen_at: string
  last_seen_at: string
  revoked_at: string | null
}

/** Append-only: the table rejects UPDATE/DELETE, so a row is a fact, not state. */
export type AuditEventRow = {
  id: number
  actor_id: string | null
  event_type: string
  resource_type: string
  resource_id: string | null
  metadata: Json
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      user_profiles: Table<
        UserProfileRow,
        Partial<UserProfileRow>,
        Partial<UserProfileRow>
      >
      inspector_devices: Table<
        InspectorDeviceRow,
        Partial<InspectorDeviceRow>,
        Partial<InspectorDeviceRow>
      >
      inspector_applications: Table<{
        user_id: string
        experience_years: number
        cities: string[]
        specialties: string[]
        qualification: string
        availability: string
        has_equipment: boolean
        notes: string
        terms_version: string | null
        terms_accepted_at: string | null
        submitted_at: string
      }, {
        user_id: string
        experience_years: number
        cities: string[]
        specialties: string[]
        qualification: string
        availability: string
        has_equipment: boolean
        notes?: string
        submitted_at?: string
      }, Partial<{
        user_id: string
        experience_years: number
        cities: string[]
        specialties: string[]
        qualification: string
        availability: string
        has_equipment: boolean
        notes: string
        terms_version?: string | null
        terms_accepted_at?: string | null
        submitted_at: string
      }>>
      inspections: Table<
        InspectionRow,
        Partial<InspectionRow> & Pick<InspectionRow, 'id' | 'customer_id' | 'vehicle' | 'city' | 'district' | 'address' | 'services' | 'scheduled_at'>,
        Partial<InspectionRow>
      >
      inspection_offers: Table<
        InspectionOfferRow,
        Partial<InspectionOfferRow> & Pick<InspectionOfferRow, 'inspection_id' | 'inspector_id' | 'inspector_name' | 'price'>,
        Partial<InspectionOfferRow>
      >
      otp_challenges: Table<{
        phone: string
        code_hash: string
        attempts: number
        created_at: string
        expires_at: string
        last_sent_at: string
        locked_until: string | null
      }, {
        phone: string
        code_hash: string
        attempts?: number
        expires_at: string
        last_sent_at?: string
        locked_until?: string | null
      }, Partial<{
        phone: string
        code_hash: string
        attempts: number
        created_at: string
        expires_at: string
        last_sent_at: string
        locked_until: string | null
      }>>
      rate_limits: Table<{ bucket_hash: string; hit_count: number; reset_at: string }, {
        bucket_hash: string
        hit_count: number
        reset_at: string
      }, Partial<{ bucket_hash: string; hit_count: number; reset_at: string }>>
      inspection_reports: Table<{
        id: string
        inspection_id: string
        inspector_id: string
        checklist: Json
        notes: string
        terms_version?: string | null
        terms_accepted_at?: string | null
        submitted_at: string | null
        created_at: string
        updated_at: string
      }, {
        id?: string
        inspection_id: string
        inspector_id: string
        checklist?: Json
        notes?: string
        submitted_at?: string | null
      }, Partial<{
        id: string
        inspection_id: string
        inspector_id: string
        checklist: Json
        notes: string
        submitted_at: string | null
        updated_at: string
      }>>
      inspection_media: Table<{
        id: string
        inspection_id: string
        inspector_id: string
        object_path: string
        media_type: 'image' | 'video' | 'document'
        mime_type: string
        file_size: number
        category: string
        original_filename: string
        created_at: string
        // Added by 20261003140000_inspector_field_operations.sql — ties a photo
        // to the verification phase and records where it was taken.
        claim_id: string | null
        phase: string
        latitude: number | null
        longitude: number | null
        content_hash: string | null
        captured_at: string | null
      }, {
        id?: string
        inspection_id: string
        inspector_id: string
        object_path: string
        media_type: 'image' | 'video' | 'document'
        mime_type: string
        file_size: number
        category?: string
        original_filename?: string
        claim_id?: string | null
        phase?: string
        latitude?: number | null
        longitude?: number | null
        content_hash?: string | null
        captured_at?: string | null
      }, Partial<{
        id: string
        inspection_id: string
        inspector_id: string
        object_path: string
        media_type: 'image' | 'video' | 'document'
        mime_type: string
        file_size: number
        category: string
        original_filename: string
        claim_id: string | null
        phase: string
        latitude: number | null
        longitude: number | null
        content_hash: string | null
        captured_at: string | null
      }>>
      audit_events: Table<{
        id: number
        actor_id: string | null
        event_type: string
        resource_type: string
        resource_id: string | null
        metadata: Json
        created_at: string
      }, {
        id?: number
        actor_id?: string | null
        event_type: string
        resource_type: string
        resource_id?: string | null
        metadata?: Json
      }, Partial<{
        id: number
        actor_id: string | null
        event_type: string
        resource_type: string
        resource_id: string | null
        metadata: Json
      }>>
      // ── Field operations (20261003140000) ──────────────────────────────────
      inspector_claims: Table<{
        id: string
        inspection_id: string
        inspector_id: string
        city: string
        status: 'claimed' | 'in_progress' | 'completed' | 'cancelled' | 'handed_over'
        claimed_at: string
        claim_lat: number | null
        claim_lng: number | null
        claim_accuracy_m: number | null
        claim_distance_m: number | null
        odometer_km: number | null
        plate_confirmed: boolean
        verification_completed_at: string | null
        started_at: string | null
        completed_at: string | null
        cancelled_at: string | null
        cancel_reason: string | null
        cancel_note: string
        handed_over_to: string | null
        created_at: string
        updated_at: string
      }, {
        id?: string
        inspection_id: string
        inspector_id: string
        city: string
        status?: 'claimed' | 'in_progress' | 'completed' | 'cancelled' | 'handed_over'
        claim_lat?: number | null
        claim_lng?: number | null
        claim_accuracy_m?: number | null
        claim_distance_m?: number | null
        odometer_km?: number | null
        plate_confirmed?: boolean
        verification_completed_at?: string | null
        started_at?: string | null
        completed_at?: string | null
        cancelled_at?: string | null
        cancel_reason?: string | null
        cancel_note?: string
        handed_over_to?: string | null
      }, Partial<{
        id: string
        inspection_id: string
        inspector_id: string
        city: string
        status: 'claimed' | 'in_progress' | 'completed' | 'cancelled' | 'handed_over'
        claim_lat: number | null
        claim_lng: number | null
        claim_accuracy_m: number | null
        claim_distance_m: number | null
        odometer_km: number | null
        plate_confirmed: boolean
        verification_completed_at: string | null
        started_at: string | null
        completed_at: string | null
        cancelled_at: string | null
        cancel_reason: string | null
        cancel_note: string
        handed_over_to: string | null
        updated_at: string
      }>>
      field_actions: {
        Row: {
          id: number
          claim_id: string
          inspection_id: string
          inspector_id: string
          action_type: string
          action_detail: string
          recorded_at: string
          recorded_at_rfc3339: string
          device_monotonic_ms: number | null
          latitude: number | null
          longitude: number | null
          accuracy_m: number | null
          offline_queued: boolean
          payload: Json
          prev_hash: string
          content_hash: string
          created_at: string
        }
        Insert: {
          claim_id: string
          inspection_id: string
          inspector_id: string
          action_type: string
          action_detail?: string
          recorded_at?: string
          recorded_at_rfc3339: string
          device_monotonic_ms?: number | null
          latitude?: number | null
          longitude?: number | null
          accuracy_m?: number | null
          offline_queued?: boolean
          payload?: Json
          prev_hash?: string
          content_hash: string
        }
        // The table is append-only; the only write a caller can express is an
        // insert, which is why this is `never` rather than a full row.
        Update: never
        Relationships: []
      }
      inspector_support_tickets: Table<{
        id: string
        inspector_id: string
        inspection_id: string | null
        claim_id: string | null
        category: string
        subject: string
        body: string
        status: 'open' | 'in_review' | 'resolved' | 'closed'
        priority: 'low' | 'normal' | 'high' | 'urgent'
        latitude: number | null
        longitude: number | null
        created_at: string
        updated_at: string
        resolved_at: string | null
        resolution_note: string
      }, {
        id?: string
        inspector_id: string
        inspection_id?: string | null
        claim_id?: string | null
        category: string
        subject: string
        body?: string
        status?: 'open' | 'in_review' | 'resolved' | 'closed'
        priority?: 'low' | 'normal' | 'high' | 'urgent'
        latitude?: number | null
        longitude?: number | null
      }, Partial<{
        status: 'open' | 'in_review' | 'resolved' | 'closed'
        priority: 'low' | 'normal' | 'high' | 'urgent'
        resolved_at: string | null
        resolution_note: string
        updated_at: string
      }>>
      inspector_handover_requests: Table<{
        id: string
        claim_id: string
        inspection_id: string
        city: string
        from_inspector_id: string
        to_inspector_id: string | null
        reason: string
        note: string
        status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
        created_at: string
        responded_at: string | null
        expires_at: string
        latitude: number | null
        longitude: number | null
      }, {
        id?: string
        claim_id: string
        inspection_id: string
        city: string
        from_inspector_id: string
        to_inspector_id?: string | null
        reason: string
        note?: string
        status?: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
        expires_at?: string
        latitude?: number | null
        longitude?: number | null
      }, Partial<{
        status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
        to_inspector_id: string | null
        responded_at: string | null
      }>>
      inspector_badges: Table<{
        id: string
        inspector_id: string
        badge_key: string
        earned_at: string
        metric_value: number | null
      }, {
        id?: string
        inspector_id: string
        badge_key: string
        metric_value?: number | null
      }, Partial<{
        metric_value: number | null
      }>>
      inspector_payout_requests: Table<{
        id: string
        inspector_id: string
        amount: number
        currency: string
        status: 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled'
        reference: string
        latitude: number | null
        longitude: number | null
        requested_at: string
        resolved_at: string | null
        resolution_note: string
        updated_at: string
      }, {
        id?: string
        inspector_id: string
        amount: number
        currency?: string
        status?: 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled'
        reference?: string
        latitude?: number | null
        longitude?: number | null
        resolved_at?: string | null
        resolution_note?: string
      }, Partial<{
        status: 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled'
        resolved_at: string | null
        resolution_note: string
      }>>
    }
    Views: Record<string, never>
    Functions: {
      upsert_user_from_login: {
        Args: { p_phone: string; p_is_admin: boolean }
        Returns: UserProfileRow[]
      }
      upsert_clerk_user: {
        Args: { p_clerk_user_id: string; p_phone: string | null; p_name: string; p_is_admin: boolean }
        Returns: UserProfileRow[]
      }
      submit_inspector_application: {
        Args: {
          p_user_id: string
          p_experience_years: number
          p_cities: string[]
          p_specialties: string[]
          p_qualification: string
          p_availability: string
          p_has_equipment: boolean
          p_notes: string
        }
        Returns: UserProfileRow[]
      }
      verify_otp_challenge: {
        Args: { p_phone: string; p_code_hash: string; p_max_attempts: number; p_lock_ms: number }
        Returns: Json
      }
      store_otp_challenge: {
        Args: { p_phone: string; p_code_hash: string; p_expiry_minutes: number }
        Returns: undefined
      }
      consume_rate_limit: {
        Args: { p_bucket_hash: string; p_limit: number; p_window_ms: number }
        Returns: Json
      }
      submit_inspection_offer: {
        Args: {
          p_inspection_id: string
          p_inspector_id: string
          p_inspector_name: string
          p_price: number
          p_note: string
          p_cities: string[]
        }
        Returns: Json
      }
      accept_inspection_offer: {
        Args: { p_inspection_id: string; p_offer_id: string; p_customer_id: string }
        Returns: Json
      }
      advance_inspection_status: {
        Args: { p_inspection_id: string; p_inspector_id: string; p_next_status: string }
        Returns: Json
      }
      save_inspection_report: {
        Args: {
          p_inspection_id: string
          p_inspector_id: string
          p_checklist: Json
          p_notes: string
          p_submit: boolean
          p_expected_keys: string[]
          p_allowed_values: string[]
        }
        Returns: Json
      }
      bind_inspector_device: {
        Args: {
          p_inspector_id: string
          p_device_hash: string
          p_device_label: string
          p_platform: string
          p_user_agent: string
        }
        Returns: Json
      }
      // ── Field operations (20261003140000) ──────────────────────────────────
      claim_inspection_for_field: {
        Args: {
          p_inspection_id: string
          p_inspector_id: string
          p_lat: number | null
          p_lng: number | null
          p_accuracy_m: number | null
          p_max_distance_m: number | null
        }
        Returns: Json
      }
      release_field_claim: {
        Args: {
          p_claim_id: string
          p_inspector_id: string
          p_reason: string | null
          p_note: string
          p_handed_over_to: string | null
        }
        Returns: Json
      }
      record_field_action: {
        Args: {
          p_claim_id: string
          p_inspector_id: string
          p_action_type: string
          p_action_detail: string
          p_recorded_at: string
          p_device_monotonic_ms: number | null
          p_lat: number | null
          p_lng: number | null
          p_accuracy_m: number | null
          p_offline_queued: boolean
          p_payload: Json
          p_content_hash: string
        }
        Returns: Json
      }
      // ── Region coverage & offer eligibility (20261001000012) ───────────────
      //
      // ملاحظة: هذه الدوال موجودة في الترحيل لكن قد لا تكون مُطبَّقة على القاعدة
      // بعد. الاستدعاءات تتعامل مع `PGRST202` كـ«غير موجودة» وتسقط إلى مسار
      // قديم بدل أن تنهار — انظر `rpcMissing` في `lib/inspection-store.ts`.
      supported_cities: {
        Args: Record<string, never>
        Returns: string[]
      }
      inspector_is_eligible: {
        Args: { p_inspector_id: string; p_city: string; p_cities?: string[] | null }
        Returns: boolean
      }
      list_eligible_inspections: {
        Args: { p_inspector_id: string; p_limit?: number }
        Returns: InspectionRow[]
      }
      list_customer_inspections: {
        Args: { p_customer_id: string }
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
