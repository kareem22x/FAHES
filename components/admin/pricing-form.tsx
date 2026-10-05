'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { GlassPanel } from '@/components/admin/ui/glass'
import { createPricingRuleAction, type ExtActionState } from '@/lib/admin/extended-actions'
import { DollarSign } from 'lucide-react'

const cities = ['', 'الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء']
const tiers = ['', 'economy', 'mid', 'luxury', 'commercial']

export function PricingForm() {
  const router = useRouter()
  const [state, formAction] = useActionState<ExtActionState, FormData>(createPricingRuleAction, { ok: false, message: '' })

  if (state.ok) {
    setTimeout(() => router.refresh(), 100)
  }

  return (
    <GlassPanel className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <DollarSign size={16} className="text-[#475d78]" />
        <h2 className="text-sm font-medium text-[#102444]">إضافة قاعدة تسعير</h2>
      </div>
      <form action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">المدينة</label>
          <select name="city" className="admin-select">
            {cities.map((c) => (
              <option key={c} value={c}>{c || 'كل المدن'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">فئة المركبة</label>
          <select name="vehicleTier" className="admin-select">
            {tiers.map((t) => (
              <option key={t} value={t}>{t || 'كل الفئات'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">مضاعف الذروة</label>
          <input
            name="surgeMultiplier"
            type="number"
            step="0.01"
            min="0.5"
            max="5"
            defaultValue="1.00"
            className="admin-search-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">تعديل ثابت</label>
          <input
            name="flatAdjustment"
            type="number"
            step="0.01"
            defaultValue="0"
            className="admin-search-input"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-[#65768d]">الأولوية</label>
          <input
            name="priority"
            type="number"
            defaultValue="0"
            className="admin-search-input"
          />
        </div>
        {state.message && (
          <p className={`col-span-2 text-xs ${state.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{state.message}</p>
        )}
        <button type="submit" className="admin-btn admin-btn-solid col-span-2 w-fit">
          إضافة القاعدة
        </button>
      </form>
    </GlassPanel>
  )
}

