import SupportShell from '@/components/support/support-shell'
import { dashboardPath, requirePhoneVerified, requireSession } from '@/lib/auth'
import { maskPhone } from '@/lib/phone'
import { isOpenTicket, listTicketsForRequester } from '@/lib/support/store'
import { getUserById } from '@/lib/user-store'

/**
 * Resolves the session into the support shell's props.
 *
 * `/support` sits outside the customer dashboard tree, so without this the
 * ticket screens rendered as bare full-width pages with none of the product's
 * chrome — the one place in the app where a signed-in user could not see where
 * they were or get back to their own console.
 *
 * The layout is also the right place for the phone gate: every route beneath it
 * belongs to the same ticket system, so a new page cannot be added without it.
 */
export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  await requirePhoneVerified(session)

  const [user, tickets] = await Promise.all([
    getUserById(session.sub),
    listTicketsForRequester(session.sub),
  ])

  const name = user?.name?.trim() || 'حسابي'

  // The label is derived from the resolved destination rather than from `role`,
  // so an owner standing in a surface is offered the console they are in.
  const consoleHref = dashboardPath(session)
  const consoleLabel = consoleHref.startsWith('/inspector')
    ? 'لوحة الفاحص'
    : consoleHref.startsWith('/admin')
      ? 'لوحة المشرف'
      : 'لوحة العميل'

  return (
    <SupportShell
      name={name}
      phone={session.phone ? maskPhone(session.phone) : null}
      openCount={tickets.filter(isOpenTicket).length}
      consoleHref={consoleHref}
      consoleLabel={consoleLabel}
    >
      {children}
    </SupportShell>
  )
}
