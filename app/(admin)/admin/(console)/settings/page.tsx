import { requireAdminPage } from '@/lib/admin/rbac'
import { listSystemSettings } from '@/lib/admin/extended-store'
import { GlassPanel, GlassCard, GlassBadge, EmptyState, Notice } from '@/components/admin/ui/glass'
import { KillSwitchToggle } from '@/components/admin/kill-switch-toggle'
import { Settings as SettingsIcon, Power, Shield, Zap } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  await requireAdminPage()

  const { settings, migrationPending } = await listSystemSettings()

  const killSwitch = settings.find((s) => s.key === 'kill_switch')
  const auditRate = settings.find((s) => s.key === 'audit_sample_rate')
  const pricingDefaults = settings.find((s) => s.key === 'pricing_defaults')
  const dispatchSettings = settings.find((s) => s.key === 'dispatch_settings')

  const isKilled = killSwitch ? Boolean((killSwitch.value as { global_disabled?: boolean })?.global_disabled) : false
  const disabledCities = killSwitch ? ((killSwitch.value as { disabled_cities?: string[] })?.disabled_cities ?? []) : []

  return (
    <div className="flex flex-col gap-4">
      {migrationPending && (
        <Notice tone="warn" title="الترحيل معلَّق">
          جدول <code className="admin-code">system_settings</code> غير موجود. طبّق ترحيل الـ40 وحدة.
        </Notice>
      )}

      {/* Kill switch — most prominent */}
      <GlassPanel className={`p-5 ${isKilled ? 'border-rose-300 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-lg ${isKilled ? 'bg-rose-100' : 'bg-emerald-100'}`}>
              <Power size={20} className={isKilled ? 'text-rose-600' : 'text-emerald-600'} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#102444]">مفتاح الطوارئ</h2>
              <p className="text-[11px] text-[#65768d]">
                {isKilled ? 'النظام متعطّل عالميًا' : 'النظام يعمل بشكل طبيعي'}
              </p>
            </div>
          </div>
          <KillSwitchToggle current={isKilled} />
        </div>
        {disabledCities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {disabledCities.map((city) => (
              <span key={city} className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">{city}</span>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Settings grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {auditRate && (
          <GlassCard title="نسبة مراجعة الجودة">
            <div className="flex items-center gap-3">
              <Shield size={20} className="text-sky-600" />
              <div>
                <p className="text-2xl font-semibold text-[#102444]">
                  {Math.round(((auditRate.value as { rate?: number } | null)?.rate ?? 0) * 100) || 10}%
                </p>
                <p className="text-[10px] text-[#65768d]">من التقارير تُحال لمراجعة بشرية</p>
              </div>
            </div>
          </GlassCard>
        )}

        {pricingDefaults && (
          <GlassCard title="إعدادات التسعير">
            <div className="flex items-center gap-3">
              <SettingsIcon size={20} className="text-amber-600" />
              <div>
                <p className="text-2xl font-semibold text-[#102444]">
                  ¥{(pricingDefaults.value as { base?: number })?.base ?? 250}
                </p>
                <p className="text-[10px] text-[#65768d]">سعر الأساس · مضاعف الذروة {(pricingDefaults.value as { surge_multiplier?: number })?.surge_multiplier ?? 1}×</p>
              </div>
            </div>
          </GlassCard>
        )}

        {dispatchSettings && (
          <GlassCard title="إعدادات التوجيه">
            <div className="flex items-center gap-3">
              <Zap size={20} className="text-violet-600" />
              <div>
                <p className="text-lg font-semibold text-[#102444]">
                  {(dispatchSettings.value as { auto_dispatch?: boolean })?.auto_dispatch ? 'تلقائي' : 'يدوي'}
                </p>
                <p className="text-[10px] text-[#65768d]">
                  أقصى مسافة: {(dispatchSettings.value as { max_distance_km?: number })?.max_distance_km ?? 30} كم ·
                  أدنى تقييم: {(dispatchSettings.value as { min_rating?: number })?.min_rating ?? 3.5}
                </p>
              </div>
            </div>
          </GlassCard>
        )}
      </div>

      {/* All settings table */}
      <GlassCard title="جميع الإعدادات">
        {settings.length === 0 ? (
          <EmptyState>لا إعدادات — الجدول غير مُهيّأ</EmptyState>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>المفتاح</th>
                  <th>القيمة</th>
                  <th>الوصف</th>
                  <th>آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {settings.map((s) => (
                  <tr key={s.key}>
                    <td><code className="admin-code">{s.key}</code></td>
                    <td className="text-xs text-[#0f172a]">{JSON.stringify(s.value)}</td>
                    <td className="text-xs text-[#65768d]">{s.description}</td>
                    <td className="text-[10px] text-[#94a3b8]">
                      {new Date(s.updated_at).toLocaleDateString('ar-SA', { dateStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
