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
  status: 'open' | 'assigned' | 'on_the_way' | 'arrived' | 'inspecting' | 'completed' | 'cancelled'
  assigned_inspector_id: string | null
  accepted_offer_id: string | null
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

export type Database = {
  public: {
    Tables: {
      user_profiles: Table<
        UserProfileRow,
        Partial<UserProfileRow>,
        Partial<UserProfileRow>
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
        media_type: 'image' | 'video'
        mime_type: string
        file_size: number
        category: string
        created_at: string
      }, {
        id?: string
        inspection_id: string
        inspector_id: string
        object_path: string
        media_type: 'image' | 'video'
        mime_type: string
        file_size: number
        category?: string
      }, Partial<{
        id: string
        inspection_id: string
        inspector_id: string
        object_path: string
        media_type: 'image' | 'video'
        mime_type: string
        file_size: number
        category: string
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
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
