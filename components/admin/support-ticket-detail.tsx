'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  CarFront,
  Lock,
  MapPin,
  MessageSquare,
  Paperclip,
  ShieldAlert,
  Siren,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { GlassBadge, GlassPanel } from '@/components/admin/ui/glass'
import {
  addInternalNoteAction,
  claimTicketAction,
  deleteMessageAction,
  escalateTicketAction,
  replyToTicketAction,
  replyWithCannedAction,
  setTicketPriorityAction,
  setTicketStatusAction,
  type SupportActionState,
} from '@/lib/support/admin-actions'
import {
  categoryLabels,
  priorityLabels,
  priorityOrder,
  requesterRoleLabels,
  statusOrder,
  ticketStatusLabels,
  ticketStatusTone,
} from '@/lib/support/labels'
import type { CannedResponse, SupportEvent, SupportMessage, SupportTicket } from '@/lib/support/store'

/**
 * Admin ticket workspace: thread, agent composer, internal notes, canned
 * responses, escalation and a quick-inspect sidebar.
 *
 * Each mutating control is wrapped in `ActionForm`, which binds a server action
 * through `useActionState` and renders its verdict inline — so an agent sees the
 * outcome (including "already assigned") without leaving the page.
 */

type RequesterSummary = {
  name: string
  phone: string | null
  role: string
  verified: boolean
  /**
   * Pre-formatted on the server, not a timestamp.
   *
   * The agent needs "is this a brand-new account or a long-standing one?" and
   * formatting it here would call `Date.now()` during render — a different
   * answer on the server and in the browser, which React flags as a hydration
   * mismatch. `null` means the row carries no creation date, and the row is
   * omitted rather than guessed at.
   */
  accountAge: string | null
  /** Always present: a missing last-login is itself worth stating. */
  lastSeen: string
}

type RecentOrder = { id: string; label: string; status: string }

function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: SupportActionState, formData: FormData) => Promise<SupportActionState>
  children: React.ReactNode
  className?: string
}) {
  const [state, formAction, pending] = useActionState<SupportActionState, FormData>(action, {
    ok: false,
    message: '',
  })
  return (
    <form action={formAction} className={className}>
      {children}
      {(state.message || pending) && (
        <span className={`mt-1 block text-[10px] ${pending ? 'text-[#65768d]' : state.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
          {pending ? 'جارٍ التنفيذ…' : state.message}
        </span>
      )}
    </form>
  )
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminTicketDetail({
  ticket,
  messages,
  events,
  canned,
  requester,
  recentOrders,
}: {
  ticket: SupportTicket
  messages: SupportMessage[]
  events: SupportEvent[]
  canned: CannedResponse[]
  requester: RequesterSummary
  recentOrders: RecentOrder[]
}) {
  const [showEvents, setShowEvents] = useState(false)

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <Link href="/admin/support" className="inline-flex items-center gap-1.5 text-[11px] text-[#0b5cad] hover:underline">
        <ArrowRight size={14} />
        كل التذاكر
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* ── Thread ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <GlassPanel className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-[#102444]">{ticket.subject}</h1>
              <GlassBadge tone={ticketStatusTone[ticket.status]}>{ticketStatusLabels[ticket.status]}</GlassBadge>
              <GlassBadge tone={ticket.priority === 'critical' || ticket.priority === 'high' ? 'bad' : ticket.priority === 'medium' ? 'warn' : 'neutral'}>
                {priorityLabels[ticket.priority]}
              </GlassBadge>
              <GlassBadge tone="neutral">{categoryLabels[ticket.category]}</GlassBadge>
              {ticket.escalatedTo && (
                <GlassBadge tone="bad">
                  <Siren size={11} /> مُصعّدة إلى {ticket.escalatedTo === 'operations' ? 'العمليات' : 'المشرفين'}
                </GlassBadge>
              )}
            </div>
            <p className="mt-1 text-[10px] text-[#94a3b8]" dir="ltr">{ticket.ticketNumber}</p>
            <p className="mt-3 whitespace-pre-wrap text-[12px] leading-6 text-[#33465f]">{ticket.body}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#eef3f9] pt-3">
              <ActionForm action={setTicketStatusAction} className="flex items-center gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <select
                  name="status"
                  defaultValue={ticket.status}
                  className="rounded-lg border border-[#e3eaf2] bg-white px-2.5 py-1.5 text-[11px] text-[#33465f] outline-none"
                >
                  {statusOrder.map((value) => (
                    <option key={value} value={value}>{ticketStatusLabels[value]}</option>
                  ))}
                </select>
                <button type="submit" className="admin-btn admin-btn-sm">تحديث الحالة</button>
              </ActionForm>

              {/* Re-triage. The requester no longer picks a priority, so this is
                  the only place it is ever set after creation — and changing it
                  moves the first-response deadline the console colours red. */}
              <ActionForm action={setTicketPriorityAction} className="flex items-center gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <select
                  name="priority"
                  defaultValue={ticket.priority}
                  aria-label="أولوية التذكرة"
                  className="rounded-lg border border-[#e3eaf2] bg-white px-2.5 py-1.5 text-[11px] text-[#33465f] outline-none"
                >
                  {priorityOrder.map((value) => (
                    <option key={value} value={value}>{priorityLabels[value]}</option>
                  ))}
                </select>
                <button type="submit" className="admin-btn admin-btn-sm">تحديث الأولوية</button>
              </ActionForm>

              {ticket.assignedTo === null && (
                <ActionForm action={claimTicketAction}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <button type="submit" className="admin-btn admin-btn-sm admin-btn-success">إسناد إليّ</button>
                </ActionForm>
              )}

              <button
                type="button"
                onClick={() => setShowEvents((value) => !value)}
                className="text-[11px] text-[#0b5cad] hover:underline"
              >
                {showEvents ? 'إخفاء السجل' : `السجل (${events.length})`}
              </button>
            </div>

            {showEvents && (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-[#eef3f9] pt-3">
                {events.map((event) => (
                  <li key={event.id} className="flex items-center gap-2 text-[10px] text-[#65768d]">
                    <span className="size-1.5 rounded-full bg-[#c7d6e8]" />
                    <span>{event.eventType}</span>
                    {event.fromValue && <span dir="ltr">{event.fromValue} → {event.toValue}</span>}
                    <span className="text-[#b6c0cd]">{formatTime(event.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>

          {/* Messages */}
          <GlassPanel className="p-4">
            <div className="flex flex-col gap-3">
              {messages.length === 0 && <p className="py-6 text-center text-[11px] text-[#94a3b8]">لا رسائل بعد.</p>}
              {messages.map((message) => {
                const fromAgent = message.authorRole === 'admin'
                return (
                  <div key={message.id} className={`flex ${fromAgent ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12px] leading-6 ${
                        message.isInternal
                          ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-900'
                          : fromAgent
                            ? 'bg-[#0b1f46] text-white'
                            : 'bg-[#eef4fb] text-[#102444]'
                      }`}
                    >
                      <span className="mb-1 flex items-center gap-1.5 text-[9px] opacity-75">
                        {message.isInternal && <Lock size={11} />}
                        {message.isInternal ? 'ملاحظة داخلية' : fromAgent ? 'فريق الدعم' : 'المستخدم'} · {formatTime(message.createdAt)}
                      </span>
                      {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
                      {message.attachmentPath && (
                        <a
                          href={`/api/support/attachments?path=${encodeURIComponent(message.attachmentPath)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-1 text-[10px] hover:underline"
                        >
                          <Paperclip size={12} />
                          {message.attachmentName ?? 'مرفق'}
                        </a>
                      )}
                      {fromAgent && (
                        <ActionForm action={deleteMessageAction} className="mt-1.5">
                          <input type="hidden" name="ticketId" value={ticket.id} />
                          <input type="hidden" name="messageId" value={message.id} />
                          <button type="submit" className="inline-flex items-center gap-1 text-[9px] text-white/60 hover:text-white">
                            <Trash2 size={11} /> حذف
                          </button>
                        </ActionForm>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </GlassPanel>

          {/* Agent composer */}
          <GlassPanel className="p-4">
            <ActionForm action={replyToTicketAction} className="flex flex-col gap-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <label className="text-[11px] font-medium text-[#475d78]">رد عام على المستخدم</label>
              <textarea
                name="body"
                rows={3}
                placeholder="اكتب ردّك للمستخدم…"
                className="w-full resize-y rounded-lg border border-[#e3eaf2] px-3 py-2 text-[12px] leading-6 outline-none focus:border-[#93c5fd]"
              />
              <div className="flex justify-end">
                <button type="submit" className="admin-btn admin-btn-sm admin-btn-solid">إرسال الرد</button>
              </div>
            </ActionForm>

            <div className="mt-3 border-t border-[#eef3f9] pt-3">
              <ActionForm action={replyWithCannedAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <MessageSquare size={14} className="text-[#65768d]" />
                <select
                  name="cannedId"
                  defaultValue={canned[0]?.id ?? ''}
                  className="min-w-[200px] flex-1 rounded-lg border border-[#e3eaf2] bg-white px-2.5 py-1.5 text-[11px] text-[#33465f] outline-none"
                >
                  {canned.length === 0 && <option value="">لا ردود جاهزة</option>}
                  {canned.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
                <button type="submit" disabled={canned.length === 0} className="admin-btn admin-btn-sm">إرسال رد جاهز</button>
              </ActionForm>
            </div>

            <div className="mt-3 border-t border-[#eef3f9] pt-3">
              <ActionForm action={addInternalNoteAction} className="flex flex-col gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <label className="text-[11px] font-medium text-[#475d78]">ملاحظة داخلية (لا تظهر للمستخدم)</label>
                <textarea
                  name="body"
                  rows={2}
                  placeholder="ملاحظة لفريق الدعم فقط…"
                  className="w-full resize-y rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2 text-[12px] leading-6 outline-none focus:border-amber-400"
                />
                <div className="flex justify-end">
                  <button type="submit" className="admin-btn admin-btn-sm admin-btn-warn">حفظ الملاحظة</button>
                </div>
              </ActionForm>
            </div>

            <div className="mt-3 border-t border-[#eef3f9] pt-3">
              <ActionForm action={escalateTicketAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <Siren size={14} className="text-rose-500" />
                <select
                  name="target"
                  defaultValue="operations"
                  className="rounded-lg border border-[#e3eaf2] bg-white px-2.5 py-1.5 text-[11px] text-[#33465f] outline-none"
                >
                  <option value="operations">تصعيد إلى العمليات</option>
                  <option value="admin">تصعيد إلى مشرفي النظام</option>
                </select>
                <input
                  name="note"
                  placeholder="سبب التصعيد (اختياري)"
                  className="min-w-[180px] flex-1 rounded-lg border border-[#e3eaf2] px-2.5 py-1.5 text-[11px] outline-none"
                />
                <button type="submit" className="admin-btn admin-btn-sm admin-btn-danger">تصعيد</button>
              </ActionForm>
            </div>
          </GlassPanel>
        </div>

        {/* ── Quick-inspect sidebar ───────────────────────────────────────── */}
        <aside className="flex flex-col gap-3">
          <GlassPanel className="p-4">
            <h2 className="text-[12px] font-medium text-[#102444]">بيانات مقدّم التذكرة</h2>
            <div className="mt-3 flex flex-col gap-2 text-[11px]">
              <Row label="الاسم" value={requester.name} />
              <Row label="الجوال" value={requester.phone ?? 'غير مضاف'} ltr />
              <Row label="الدور" value={requesterRoleLabels[requester.role] ?? requester.role} />
              {requester.accountAge && <Row label="عمر الحساب" value={requester.accountAge} />}
              <Row label="آخر ظهور" value={requester.lastSeen} />
              <div className="flex items-center justify-between">
                <span className="text-[#65768d]">توثيق الجوال</span>
                {requester.verified ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600"><BadgeCheck size={13} /> موثّق</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600"><ShieldAlert size={13} /> غير موثّق</span>
                )}
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-4">
            <h2 className="flex items-center gap-1.5 text-[12px] font-medium text-[#102444]">
              <CarFront size={14} /> آخر الطلبات
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {recentOrders.length === 0 ? (
                <p className="text-[10px] text-[#94a3b8]">لا طلبات مسجلة.</p>
              ) : (
                recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between text-[10px]">
                    <span className="truncate text-[#33465f]">{order.label}</span>
                    <span className="shrink-0 text-[#94a3b8]">{order.status}</span>
                  </div>
                ))
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-4">
            <h2 className="flex items-center gap-1.5 text-[12px] font-medium text-[#102444]">
              <Smartphone size={14} /> بيانات الجهاز
            </h2>
            <div className="mt-3 flex flex-col gap-1.5 text-[10px] text-[#65768d]">
              {Object.entries(ticket.deviceInfo).length === 0 ? (
                <p className="text-[#94a3b8]">لم تُلتقط بيانات الجهاز.</p>
              ) : (
                Object.entries(ticket.deviceInfo).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-2">
                    <span className="text-[#94a3b8]" dir="ltr">{key}</span>
                    <span className="max-w-[60%] truncate text-left" dir="ltr">{String(value)}</span>
                  </div>
                ))
              )}
            </div>
            {ticket.latitude !== null && ticket.longitude !== null && (
              <a
                href={`https://maps.google.com/?q=${ticket.latitude},${ticket.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#0b5cad] hover:underline"
              >
                <MapPin size={12} /> عرض الموقع على الخريطة
              </a>
            )}
          </GlassPanel>

          {ticket.satisfactionRating !== null && (
            <GlassPanel className="p-4">
              <h2 className="text-[12px] font-medium text-[#102444]">رضا العميل</h2>
              <p className="mt-2 text-2xl font-semibold text-amber-500">{ticket.satisfactionRating}/٥</p>
              {ticket.satisfactionNote && <p className="mt-1 text-[10px] text-[#65768d]">{ticket.satisfactionNote}</p>}
            </GlassPanel>
          )}
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#65768d]">{label}</span>
      <span className="max-w-[60%] truncate text-[#102444]" dir={ltr ? 'ltr' : undefined}>{value}</span>
    </div>
  )
}
