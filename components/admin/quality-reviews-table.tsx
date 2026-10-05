'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { GlassPanel, GlassBadge } from '@/components/admin/ui/glass'
import { auditQueueStatusLabels, auditQueueStatusTone } from '@/lib/admin/labels'
import { reviewAuditAction, type ExtActionState } from '@/lib/admin/extended-actions'
import type { InspectionAudit } from '@/lib/admin/extended-store'

export function QualityReviewsTable({ audits }: { audits: InspectionAudit[] }) {
  const router = useRouter()
  const [state, formAction] = useActionState<ExtActionState, FormData>(reviewAuditAction, { ok: false, message: '' })

  if (state.ok) {
    setTimeout(() => router.refresh(), 100)
  }

  return (
    <GlassPanel className="overflow-hidden">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>الطلب</th>
              <th>المراجع</th>
              <th>الحالة</th>
              <th>ملاحظات</th>
              <th>الفئات المعلَّمة</th>
              <th>التاريخ</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => (
              <tr key={a.id}>
                <td className="font-medium text-[#102444]">{a.inspection_id}</td>
                <td className="text-xs text-[#65768d]">{a.auditor_name || '—'}</td>
                <td>
                  <GlassBadge tone={auditQueueStatusTone[a.status] ?? 'neutral'}>
                    {auditQueueStatusLabels[a.status] ?? a.status}
                  </GlassBadge>
                </td>
                <td className="max-w-[200px] truncate text-xs text-[#0f172a]">{a.audit_notes || '—'}</td>
                <td>
                  {a.flagged_categories.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {a.flagged_categories.map((cat) => (
                        <span key={cat} className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] text-rose-700">{cat}</span>
                      ))}
                    </div>
                  ) : '—'}
                </td>
                <td className="text-[10px] text-[#65768d]">
                  {new Date(a.created_at).toLocaleDateString('ar-SA', { dateStyle: 'short' })}
                </td>
                <td>
                  {a.status === 'pending' && (
                    <div className="flex gap-1">
                      <form action={formAction}>
                        <input type="hidden" name="auditId" value={a.id} />
                        <input type="hidden" name="status" value="passed" />
                        <input type="hidden" name="notes" value="" />
                        <button type="submit" className="admin-btn admin-btn-sm admin-btn-success">قبول</button>
                      </form>
                      <form action={formAction}>
                        <input type="hidden" name="auditId" value={a.id} />
                        <input type="hidden" name="status" value="flagged_for_fix" />
                        <input type="hidden" name="notes" value="" />
                        <button type="submit" className="admin-btn admin-btn-sm admin-btn-warn">تعليم</button>
                      </form>
                      <form action={formAction}>
                        <input type="hidden" name="auditId" value={a.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <input type="hidden" name="notes" value="" />
                        <button type="submit" className="admin-btn admin-btn-sm admin-btn-danger">رفض</button>
                      </form>
                    </div>
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
