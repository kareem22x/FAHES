import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import { redirect } from 'next/navigation'
import { Activity, ArrowLeft, CarFront, CheckCircle2, Clock3, LayoutDashboard, UsersRound, WalletCards } from 'lucide-react'
import { LogoutButton } from '@/components/logout-button'
import { requireSession } from '@/lib/auth'
import { platformStats } from '@/lib/user-store'

export default async function AdminPage() {
  const session = await requireSession()
  if (session.role === 'admin_pending') redirect('/admin/gate')
  if (session.role !== 'admin') redirect('/dashboard')
  const stats = await platformStats()

  return (
    <main dir="rtl" className="min-h-screen bg-[#f5f6f2] text-[#0b1f46]">
      <div className="mx-auto flex max-w-[1400px] gap-6 px-5 py-5 sm:px-8">
        <aside className="hidden w-60 shrink-0 rounded-3xl bg-[#0b1f46] p-5 text-white lg:block">
          <Link href="/" className="flex items-center gap-3 border-b border-white/10 pb-7 font-black"><BrandMark className="size-9 shrink-0 object-contain" />فاحص.</Link>
          <nav className="mt-7 flex flex-col gap-2">
            <Link href="/admin" className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3 text-sm font-bold"><LayoutDashboard className="size-4 text-[#1385f5]" />نظرة عامة</Link>
            <Link href="/admin/inspectors" className="rounded-xl px-3 py-3 text-sm text-white/60 hover:bg-white/10 hover:text-white">الفاحصون</Link>
            <Link href="/admin/users" className="rounded-xl px-3 py-3 text-sm text-white/60 hover:bg-white/10 hover:text-white">المستخدمون</Link>
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-[#0873d1]">الإدارة المحمية</p><h1 className="mt-1 text-3xl font-black tracking-[-.05em]">نظرة عامة</h1></div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-white px-4 py-2 text-xs font-bold text-[#39764d] shadow-sm"><span className="ml-2 inline-block size-2 rounded-full bg-[#4ba466]" />جلسة إدارة نشطة</span>
              <LogoutButton />
            </div>
          </header>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={<UsersRound />} label="المستخدمون" value={String(stats.users)} />
            <Stat icon={<CarFront />} label="الفاحصون المعتمدون" value={String(stats.inspectors)} />
            <Stat icon={<CheckCircle2 />} label="بانتظار الاعتماد" value={String(stats.pendingInspectors)} />
            <Stat icon={<WalletCards />} label="المديرون" value={String(stats.admins)} />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
            <section className="rounded-3xl border border-[#0b1f46]/10 bg-white p-6">
              <div className="flex items-center justify-between"><h2 className="font-black">حماية اللوحة</h2><span className="flex items-center gap-2 text-xs text-[#65768d]"><Activity className="size-4" /> طبقات متعددة</span></div>
              <ul className="mt-6 space-y-3 text-sm leading-7 text-[#607087]">
                <li>دخول عبر Clerk ثم رمز إدارة سري منفصل.</li>
                <li>أرقام المديرين مسموحة فقط من متغير البيئة ADMIN_PHONES.</li>
                <li>جلسة Clerk مع رمز رفع صلاحية HttpOnly وSameSite=Strict وفحص الدور على الخادم.</li>
                <li>تقييد معدل المحاولات وفحص أصل الطلب (Origin) على واجهات التعديل.</li>
              </ul>
            </section>
            <section className="rounded-3xl border border-[#0b1f46]/10 bg-white p-6">
              <h2 className="font-black">يحتاج انتباهك</h2>
              <div className="mt-5 flex flex-col gap-3">
                <Notice icon={<Clock3 />} title="فاحصون بانتظار التحقق" value={String(stats.pendingInspectors)} href="/admin/inspectors" />
                <Notice icon={<UsersRound />} title="كل المستخدمين" value={String(stats.users)} href="/admin/users" />
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-[#0b1f46]/10 bg-white p-5"><span className="text-[#0873d1]">{icon}</span><p className="mt-6 text-sm text-[#65768d]">{label}</p><strong className="mt-1 block text-2xl font-black">{value}</strong></div>
}

function Notice({ icon, title, value, href }: { icon: React.ReactNode; title: string; value: string; href: string }) {
  return <Link href={href} className="flex items-center gap-3 rounded-xl bg-[#f5f6f2] p-4"><span className="text-[#0873d1]">{icon}</span><span className="flex-1 text-sm font-bold">{title}</span><strong>{value}</strong><ArrowLeft className="size-4 text-[#9aa49f]" /></Link>
}
