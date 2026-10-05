import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser as clerkCurrentUser } from '@clerk/nextjs/server'
import { ArrowRight, LifeBuoy } from 'lucide-react'
import { StaffProfile } from '@/components/admin/staff-profile'
import { requireAdminPage, tierOf } from '@/lib/admin/rbac'
import { agentWorkload, supportStats } from '@/lib/support/store'
import { getUserById } from '@/lib/user-store'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ملف موظف الدعم — فاحص' }

/**
 * The support agent's own profile, inside the console.
 *
 * ── Why a second mount point ───────────────────────────────────────────────
 *
 * There is no `support` role in this system: a support agent is an `admin`, and
 * `/admin/support` is gated by `requireAdminPage()`. So this screen and the one
 * linked from `/admin/settings` are the *same* `StaffProfile` component — this
 * route exists because an agent working the ticket queue looks for their profile
 * next to the queue, not buried in platform settings.
 *
 * The workload panel is the part that is unique to this mount: it answers "how
 * much is on my plate right now", which is meaningless on the generic admin
 * profile.
 */
export default async function SupportAgentProfilePage() {
  const session = await requireAdminPage()

  const [user, clerkUser, workload, stats] = await Promise.all([
    getUserById(session.sub),
    clerkCurrentUser(),
    agentWorkload(session.sub),
    supportStats(),
  ])

  // No `user_profiles` row means the account was never provisioned. Redirect
  // rather than substituting a placeholder: a fabricated `createdAt` would make
  // "عمر الحساب" read "أقل من يوم" for a long-standing admin, and the two
  // `Date.now()` fallbacks that would do it also violate `react-hooks/purity`
  // (they run during render).
  if (!user) redirect('/auth/complete')

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center gap-1.5 text-[11px] text-[#65768d]">
        <Link href="/admin/support" className="inline-flex items-center gap-1 hover:text-[#2563eb]">
          <ArrowRight size={13} />
          الدعم الفني
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-[#102444]">ملفي الشخصي</span>
      </nav>

      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-[#eef4ff] text-[#2563eb]">
          <LifeBuoy size={20} />
        </span>
        <div>
          <h1 className="text-lg font-bold text-[#102444]">ملف موظف الدعم الفني</h1>
          <p className="text-[11px] text-[#65768d]">
            بياناتك، صلاحياتك، وحِمل التذاكر المسند إليك.
          </p>
        </div>
      </header>

      <StaffProfile
        name={user.name}
        email={clerkUser?.primaryEmailAddress?.emailAddress ?? null}
        phone={session.phone}
        phoneVerified={session.phoneVerified}
        role={session.role}
        tier={tierOf(session)}
        createdAt={user.createdAt}
        lastLoginAt={user.lastLoginAt}
        surface={session.surface}
        workload={{
          assignedOpen: workload.assignedOpen,
          resolved: workload.resolved,
          avgFirstResponseMinutes: stats.avgFirstResponseMinutes,
        }}
      />
    </div>
  )
}
