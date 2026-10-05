'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { GlassPanel } from '@/components/admin/ui/glass'
import { createShowroomAction, type ExtActionState } from '@/lib/admin/extended-actions'
import { Store } from 'lucide-react'

// The database constrains `city` to this exact set, so the form must not offer
// anything else (see the showrooms table in the 40-modules migration).
const cities = ['الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء']

export function ShowroomForm() {
  const router = useRouter()
  const [state, formAction] = useActionState<ExtActionState, FormData>(createShowroomAction, { ok: false, message: '' })

  if (state.ok) {
    setTimeout(() => router.refresh(), 100)
  }

  return (
    <GlassPanel className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Store size={16} className="text-[#475d78]" />
        <h2 className="text-sm font-medium text-[#102444]">إضافة معرض جديد</h2>
      </div>
      <form action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="mb-1 block text-[11px] text-[#65768d]">اسم المعرض</label>
          <input
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={200}
            className="admin-search-input"
            placeholder="اسم المعرض"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">المدينة</label>
          <select name="city" className="admin-select" required defaultValue="">
            <option value="" disabled>اختر المدينة</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">الحي</label>
          <input name="district" type="text" maxLength={120} className="admin-search-input" placeholder="الحي" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-[11px] text-[#65768d]">العنوان</label>
          <input name="address" type="text" maxLength={300} className="admin-search-input" placeholder="عنوان المعرض" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">الهاتف</label>
          <input name="phone" type="tel" maxLength={20} className="admin-search-input" placeholder="05xxxxxxxx" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">جهة الاتصال</label>
          <input name="contactPerson" type="text" maxLength={120} className="admin-search-input" placeholder="اسم المسؤول" />
        </div>
        <label className="col-span-2 flex items-center gap-1.5 text-xs text-[#475d78] sm:col-span-1">
          <input type="checkbox" name="isPartner" value="true" className="admin-checkbox" />
          معرض شريك
        </label>
        {state.message && (
          <p className={`col-span-2 text-xs ${state.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{state.message}</p>
        )}
        <button type="submit" className="admin-btn admin-btn-solid col-span-2 w-fit">
          إضافة المعرض
        </button>
      </form>
    </GlassPanel>
  )
}
