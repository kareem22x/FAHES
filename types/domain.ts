export type Role = 'customer' | 'inspector' | 'admin' | 'admin_pending'
export type InspectorStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'suspended'

export const inspectorSpecialties = [
  'فحص المحرك وناقل الحركة',
  'فحص الهيكل والدهان',
  'الفحص الكهربائي والإلكتروني',
  'فحص أنظمة التعليق والفرامل',
  'فحص السيارات الهجينة والكهربائية',
] as const

export const inspectorAvailabilities = ['دوام كامل', 'دوام جزئي', 'حسب المواعيد'] as const

export type InspectorApplicationInput = {
  experienceYears: number
  cities: string[]
  specialties: string[]
  qualification: string
  availability: string
  hasEquipment: boolean
  notes: string
}

export type InspectorApplicationRow = {
  user_id: string
  experience_years: number
  cities: string[]
  specialties: string[]
  qualification: string
  availability: string
  has_equipment: boolean
  notes: string
  submitted_at: string
}

export type AppUser = {
  id: string
  clerkUserId: string | null
  phone: string | null
  name: string
  role: Exclude<Role, 'admin_pending'>
  inspectorStatus: InspectorStatus
  inspectorProfile?: {
    isOnline: boolean
    cities: string[]
    updatedAt: number
  }
  createdAt: number
  lastLoginAt: number
}
