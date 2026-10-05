'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { GlassPanel, GlassBadge } from '@/components/admin/ui/glass'
import { violationTypeLabels, violationTypeTone, severityLabels, severityTone } from '@/lib/admin/labels'
import { resolveViolationAction, type ExtActionState } from '@/lib/admin/extended-actions'
import type { InspectorViolation } from '@/lib/admin/extended-store'

export function ViolationsTable({ violations }: { violations: InspectorViolation[] }) {
  const router = useRouter()
  const [state, formAction] = useActionState<ExtActionState, FormData>(resolveViolationAction, { ok: false, message: '' })

  if (state.ok) {
    setTimeout(() => router.refresh(), 100)
  }

  return (
    <GlassPanel className="overflow-hidden">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>الفاحص</th>
              <th>النوع</th>
              <th>الخطورة</th>
              <th>الطلب</th>
              <th>كشف آلي</th>
              <th>الحالة</th>
              <th>التاريخ</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr key={v.id}>
                <td className="font-medium text-[#102444]">{v.inspector_name}</td>
                <td>
                  <GlassBadge tone={violationTypeTone[v.violation_type] ?? 'neutral'}>
                    {violationTypeLabels[v.violation_type] ?? v.violation_type}
                  </GlassBadge>
                </td>
                <td>
                  <GlassBadge tone={severityTone[v.severity] ?? 'neutral'}>
                    {severityLabels[v.severity] ?? v.severity}
                  </GlassBadge>
                </td>
                <td className="text-[10px] text-[#65768d]">{v.inspection_id || '—'}</td>
                <td>
                  <span className={`text-[10px] ${v.auto_detected ? 'text-sky-600' : 'text-slate-500'}`}>
                    {v.auto_detected ? 'آلي' : 'يدوي'}
                  </span>
                </td>
                <td>
                  {v.resolved ? (
                    <GlassBadge tone="good">محلولة</GlassBadge>
                  ) : (
                    <GlassBadge tone="bad">غير محلولة</GlassBadge>
                  )}
                </td>
                <td className="text-[10px] text-[#65768d]">
                  {new Date(v.created_at).toLocaleDateString('ar-SA', { dateStyle: 'short' })}
                </td>
                <td>
                  {!v.resolved && (
                    <form action={formAction}>
                      <input type="hidden" name="violationId" value={v.id} />
                      <input type="hidden" name="note" value="" />
                      <button type="submit" className="admin-btn admin-btn-sm admin-btn-success">
                        حلّ
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  )
}
