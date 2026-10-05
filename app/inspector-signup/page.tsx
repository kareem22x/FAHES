import { redirect } from 'next/navigation'
import { auth as clerkAuth } from '@clerk/nextjs/server'
import { BadgeCheck, ShieldCheck } from 'lucide-react'
import { RegistrationWizard } from '@/components/modules/inspector/registration-wizard'

export const metadata = { title: 'انضم كفاحص' }

const benefits = [
  'أنشئ حسابك ووثّق جوالك وبريدك في دقائق',
  'أكمل استبيان الخبرة — 10 أسئلة تقيس مستواك',
  'بعد المراجعة، استلم طلبات الفحص في مدن تغطيتك',
]

export default async function InspectorSignupPage() {
  const { userId } = await clerkAuth()
  if (userId) redirect('/become-inspector')

  return (
    <main dir="rtl" className="min-h-screen bg-[#f7f9fc] px-5 py-10 text-[#0b1f46]">
      <div className="mx-auto max-w-3xl">
        {/* hero */}
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eff7ff] px-4 py-1.5 text-xs font-bold text-[#075cae]">
            <BadgeCheck size={14} /> انضم إلى شبكة الفاحصين
          </span>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">سجّل كفاحص</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#607087]">
            أنشئ حسابًا موثّقًا وأكمل استبيان الخبرة — 6 خطوات بسيطة تفصلك عن
            الانضمام إلى شبكة فاحصي السيارات في المنطقة الشرقية.
          </p>
          <ul className="mx-auto mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-1.5 text-xs font-semibold text-[#53677e]">
                <ShieldCheck size={14} className="text-[#0873d1]" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* wizard card */}
        <section className="mt-8 rounded-[2rem] border border-[#dce8f4] bg-white p-6 shadow-[0_20px_70px_rgba(11,31,70,.08)] sm:p-10">
          <RegistrationWizard />
        </section>

        <p className="mt-6 text-center text-xs leading-6 text-[#78879a]">
          لديك حساب بالفعل؟{' '}
          <a href="/login?next=/become-inspector" className="font-bold text-[#0873d1] hover:underline">
            سجّل الدخول وأكمل طلبك
          </a>
        </p>
      </div>
    </main>
  )
}
