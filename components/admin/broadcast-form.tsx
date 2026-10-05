'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { GlassPanel } from '@/components/admin/ui/glass'
import { createBroadcastAction, type ExtActionState } from '@/lib/admin/extended-actions'
import { Megaphone } from 'lucide-react'

const cities = ['الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء']
const priorities = ['low', 'normal', 'high', 'emergency']

export function BroadcastForm() {
  const router = useRouter()
  const [state, formAction] = useActionState<ExtActionState, FormData>(createBroadcastAction, { ok: false, message: '' })

  if (state.ok) {
    setTimeout(() => router.refresh(), 100)
  }

  return (
    <GlassPanel className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Megaphone size={16} className="text-[#475d78]" />
        <h2 className="text-sm font-medium text-[#102444]">إنشاء إعلان جديد</h2>
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-[#65768d]">العنوان</label>
            <input
              name="title"
              type="text"
              maxLength={200}
              minLength={3}
              required
              className="admin-search-input"
              placeholder="عنوان الإعلان"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[#65768d]">الأولوية</label>
            <select name="priority" className="admin-select">
              {priorities.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">النص</label>
          <textarea
            name="body"
            required
            maxLength={2000}
            rows={3}
            className="admin-search-input"
            placeholder="نص الإعلان..."
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">المدن المستهدفة (اتركه فارغًا لكل المدن)</label>
          <div className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <label key={city} className="flex items-center gap-1.5 text-xs text-[#475d78]">
                <input type="checkbox" name="cities" value={city} className="admin-checkbox" />
                {city}
              </label>
            ))}
          </div>
        </div>
        {state.message && (
          <p className={`text-xs ${state.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{state.message}</p>
        )}
        <button type="submit" className="admin-btn admin-btn-solid w-fit">
          نشر الإعلان
        </button>
      </form>
    </GlassPanel>
  )
}
