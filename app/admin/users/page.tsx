import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { requireSession } from '@/lib/auth'
import { maskPhone } from '@/lib/phone'
import { listUsers } from '@/lib/user-store'

export default async function AdminUsersPage() {
  const session = await requireSession()
  if (session.role === 'admin_pending') redirect('/admin/gate')
  if (session.role !== 'admin') redirect('/dashboard')
  const users = await listUsers()

  return (
    <main dir="rtl" className="min-h-screen bg-[#f7f9fc] text-[#0b1f46]">
      <div className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-8">
        <header className="flex h-20 items-center justify-between border-b border-[#0b1f46]/10">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-bold text-[#607087]"><ArrowRight className="size-4" /> لوحة التحكم</Link>
          <LogoutButton />
        </header>
        <h1 className="py-9 text-4xl font-black">المستخدمون</h1>
        <div className="overflow-hidden rounded-2xl border border-[#0b1f46]/10 bg-white">
          {users.length === 0 && <p className="p-8 text-sm text-[#607087]">لا يوجد مستخدمون بعد. أول تسجيل دخول موثّق عبر Clerk ينشئ سجل الحساب.</p>}
          {users.map((user) => (
            <div key={user.id} className="flex flex-col gap-2 border-b border-[#0b1f46]/10 p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black">{user.name}</p>
                <p className="text-xs text-[#78879a]">{maskPhone(user.phone)}</p>
              </div>
              <span className="text-sm font-bold">{user.role}</span>
              <span className="text-xs text-[#78879a]">{user.inspectorStatus}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
