import { redirect } from 'next/navigation'
import { VerifyIdentityForm } from '@/components/modules/account/verify-identity-form'
import { getSession, postAuthPath } from '@/lib/auth'

export default async function VerifyIdentityPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')

  // Admins and inspectors are always verified — no gate for them.
  if (session.role !== 'customer') {
    redirect(postAuthPath(session))
  }

  // Already verified? Go to account.
  if (session.isVerified) {
    redirect('/account')
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5 py-10 text-[#0b1f46]">
      <section className="w-full max-w-xl rounded-3xl border border-[#0b1f46]/10 bg-white p-7 shadow-sm sm:p-10">
        <span className="inline-flex rounded-full bg-[#fff1e8] px-3 py-1 text-xs font-bold text-[#98512e]">
          توثيق الحساب
        </span>
        <h1 className="mt-5 text-2xl font-black sm:text-3xl">
          أكمل توثيق حسابك
        </h1>
        <p className="mt-4 text-sm leading-7 text-[#607087]">
          قبل أن تتمكن من إنشاء طلبات فحص أو استقبال التقارير، يجب إكمال خطوتين:
          توثيق رقم الجوال وإدخال رقم الهوية الوطنية.
        </p>
        <div className="mt-8">
          <VerifyIdentityForm
            phoneVerified={session.phone !== null}
            currentPhone={session.phone}
          />
        </div>
      </section>
    </main>
  )
}
