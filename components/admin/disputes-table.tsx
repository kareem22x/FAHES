'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { GlassPanel, GlassBadge } from '@/components/admin/ui/glass'
import { disputeStatusLabels, disputeStatusTone } from '@/lib/admin/labels'
import { resolveDisputeAction, type ExtActionState } from '@/lib/admin/extended-actions'
import type { Dispute } from '@/lib/admin/extended-store'

export function DisputesTable({ disputes }: { disputes: Dispute[] }) {
  const router = useRouter()
  const [state, formAction] = useActionState<ExtActionState, FormData>(resolveDisputeAction, { ok: false, message: '' })

  if (state.ok) {
    setTimeout(() => router.refresh(), 100)
  }

  return (
    <GlassPanel className="overflow-hidden">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>العميل</th>
              <th>الطلب</th>
              <th>السبب</th>
              <th>الحالة</th>
              <th>الاسترداد</th>
              <th>التاريخ</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((d) => (
              <tr key={d.id}>
                <td className="font-medium text-[#102444]">{d.client_name}</td>
                <td className="text-[10px] text-[#65768d]">{d.inspection_id}</td>
                <td className="max-w-[250px]">
                  <div className="truncate text-xs text-[#0f172a]">{d.reason}</div>
                  {d.evidence_urls.length > 0 && (
                    <div className="text-[10px] text-sky-600">{d.evidence_urls.length} دليل</div>
                  )}
                </td>
                <td>
                  <GlassBadge tone={disputeStatusTone[d.status] ?? 'neutral'}>
                    {disputeStatusLabels[d.status] ?? d.status}
                  </GlassBadge>
                </td>
                <td className="text-xs font-medium text-[#102444]">¥{d.refund_amount.toFixed(2)}</td>
                <td className="text-[10px] text-[#65768d]">
                  {new Date(d.created_at).toLocaleDateString('ar-SA', { dateStyle: 'short' })}
                </td>
                <td>
                  {d.status === 'open' || d.status === 'under_review' ? (
                    <div className="flex gap-1">
                      <form action={formAction}>
                        <input type="hidden" name="disputeId" value={d.id} />
                        <input type="hidden" name="status" value="approved" />
                        <input type="hidden" name="refundAmount" value={d.refund_amount} />
                        <input type="hidden" name="note" value="" />
                        <button type="submit" className="admin-btn admin-btn-sm admin-btn-success">قبول</button>
                      </form>
                      <form action={formAction}>
                        <input type="hidden" name="disputeId" value={d.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <input type="hidden" name="refundAmount" value="0" />
                        <input type="hidden" name="note" value="" />
                        <button type="submit" className="admin-btn admin-btn-sm admin-btn-danger">رفض</button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-[10px] text-[#94a3b8]">{d.resolution_note || d.status}</span>
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
