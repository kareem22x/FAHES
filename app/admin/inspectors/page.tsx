import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BadgeCheck, CarFront, ShieldCheck, UserRound } from 'lucide-react'
import { InspectorActions } from '@/components/inspector-actions'
import { LogoutButton } from '@/components/logout-button'
import { requireSession } from '@/lib/auth'
import { maskPhone } from '@/lib/phone'
import { listInspectorApplications, listUsers } from '@/lib/user-store'

export default async function AdminInspectorsPage() {
  const session = await requireSession()
  if (session.role === 'admin_pending') redirect('/admin/gate')
  if (session.role !== 'admin') redirect('/dashboard')

  const inspectors = (await listUsers()).filter((user) => user.inspectorStatus !== 'none' || user.role === 'inspector')
  const applications = await listInspectorApplications()
  const applicationsByUserId = new Map(applications.map((application) => [application.user_id, application]))

  return (
    <main dir="rtl" className="min-h-screen bg-[#f7f9fc] text-[#0b1f46]">
      <div className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-8">
        <header className="flex h-20 items-center justify-between border-b border-[#0b1f46]/10">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-bold text-[#607087]"><ArrowRight className="size-4" /> لوحة التحكم</Link>
          <LogoutButton />
        </header>
        <div className="py-9">
          <p className="text-sm font-bold text-[#0873d1]">إدارة الفريق</p>
          <h1 className="mt-2 text-4xl font-black">الفاحصون</h1>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#0b1f46]/10 bg-white p-5"><UserRound className="text-[#0873d1]" /><p className="mt-5 text-sm text-[#607087]">طلبات الانضمام</p><strong className="mt-1 block text-2xl font-black">{inspectors.length}</strong></div>
          <div className="rounded-2xl bg-[#0b1f46] p-5 text-white"><ShieldCheck className="text-[#1385f5]" /><p className="mt-5 text-sm text-white/60">بانتظار المراجعة</p><strong className="mt-1 block text-2xl font-black">{inspectors.filter((i) => i.inspectorStatus === 'pending').length}</strong></div>
          <div className="rounded-2xl border border-[#0b1f46]/10 bg-white p-5"><BadgeCheck className="text-[#0873d1]" /><p className="mt-5 text-sm text-[#607087]">معتمدون</p><strong className="mt-1 block text-2xl font-black">{inspectors.filter((i) => i.role === 'inspector').length}</strong></div>
        </div>
        <div className="mt-8 overflow-hidden rounded-2xl border border-[#0b1f46]/10 bg-white">
          {inspectors.length === 0 && <p className="p-8 text-sm text-[#607087]">لا توجد طلبات فاحصين بعد.</p>}
          {inspectors.map((inspector) => (
            <div key={inspector.id} className="border-b border-[#0b1f46]/10 p-5 last:border-0">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black">{inspector.name}</p>
                  <p className="mt-1 text-xs text-[#78879a]">{maskPhone(inspector.phone)}</p>
                </div>
                <span className="w-fit rounded-full bg-[#f5f8e8] px-3 py-1 text-xs font-bold">{inspector.inspectorStatus}</span>
                <InspectorActions user={inspector} />
              </div>
              {(() => {
                const application = applicationsByUserId.get(inspector.id)
                if (!application) {
                  return <p className="mt-4 rounded-xl bg-[#f7f9fc] px-4 py-3 text-sm text-[#78879a]">لا توجد إجابات استبيان محفوظة لهذا الطلب.</p>
                }
                return (
                  <dl className="mt-5 grid gap-4 rounded-2xl bg-[#f7f9fc] p-4 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs font-semibold text-[#78879a]">الخبرة</dt><dd className="mt-1 font-bold">{application.experience_years === 0 ? 'أقل من سنة' : application.experience_years >= 31 ? 'أكثر من 30 سنة' : `${application.experience_years} سنة`}</dd></div>
                    <div><dt className="text-xs font-semibold text-[#78879a]">التوفر</dt><dd className="mt-1 font-bold">{application.availability}</dd></div>
                    <div><dt className="text-xs font-semibold text-[#78879a]">مدن التغطية</dt><dd className="mt-1 leading-7">{application.cities.join('، ')}</dd></div>
                    <div><dt className="text-xs font-semibold text-[#78879a]">مجالات الفحص</dt><dd className="mt-1 leading-7">{application.specialties.join('، ')}</dd></div>
                    <div><dt className="text-xs font-semibold text-[#78879a]">الشهادات والدورات</dt><dd className="mt-1 leading-7">{application.qualification || 'لم يذكر'}</dd></div>
                    <div><dt className="text-xs font-semibold text-[#78879a]">معدات الفحص</dt><dd className="mt-1">{application.has_equipment ? 'متوفرة' : 'غير متوفرة حاليًا'}</dd></div>
                    {application.notes && <div className="sm:col-span-2"><dt className="text-xs font-semibold text-[#78879a]">معلومات إضافية</dt><dd className="mt-1 whitespace-pre-wrap leading-7">{application.notes}</dd></div>}
                  </dl>
                )
              })()}
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#1385f5]/60 bg-[#f5f8e8] p-4 text-sm leading-7 text-[#68751f]">
          <CarFront className="size-5 shrink-0" /> الاعتماد يتم من الخادم بعد التحقق من جلسة المدير فقط.
        </div>
      </div>
    </main>
  )
}
