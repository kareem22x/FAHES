import Link from 'next/link'
import BrandMark from '@/components/brand-mark'
import SupportNav from '@/components/support/support-nav'
import SupportTopbar from '@/components/support/support-topbar'
import { initialsOf } from '@/lib/utils'

/**
 * The support area's chrome: sidebar, topbar, mobile navigation.
 *
 * Extracted from `app/support/layout.tsx` so the shell is a plain function of
 * its props. The layout's job is to resolve the session into those props; the
 * shell's job is to render them. Keeping them separate is what makes the shell
 * renderable without a session, which is the only way to look at it during
 * development — every real route in this tree sits behind the phone gate.
 *
 * It deliberately mirrors `app/dashboard/layout.tsx` rather than reusing it: the
 * ticket system is open to every role, so an inspector or operator opening a
 * ticket must not be told they are in «لوحة العميل». The console link is
 * therefore passed in, already resolved by `dashboardPath()`.
 */
export default function SupportShell({
  name,
  phone,
  openCount,
  consoleHref,
  consoleLabel,
  children,
}: {
  name: string
  phone: string | null
  openCount: number
  consoleHref: string
  consoleLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="app-shell" dir="rtl">
      <aside className="app-sidebar">
        <Link href="/" className="app-logo" aria-label="فاحص — الصفحة الرئيسية">
          <BrandMark className="app-logo-mark" />
          <span className="app-logo-text">
            <b>فاحص<span>.</span></b>
            <small>مركز الدعم</small>
          </span>
        </Link>

        <SupportNav openCount={openCount} consoleHref={consoleHref} consoleLabel={consoleLabel} />

        <div className="app-sidebar-foot">
          <div className="app-side-help">
            <strong>قبل أن تفتح تذكرة</strong>
            <p>تصفّح مركز المساعدة أولًا — أغلب الأسئلة لها جواب جاهز هناك.</p>
            <Link href="/help">مركز المساعدة</Link>
          </div>
          <div className="app-side-user">
            <span className="app-side-avatar" aria-hidden="true">{initialsOf(name)}</span>
            <span className="app-side-user-text">
              <strong>{name}</strong>
              <small>{phone ?? 'رقم غير مضاف'}</small>
            </span>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <SupportTopbar />
        <nav className="app-mobile-nav" aria-label="تنقل مركز الدعم للجوال">
          <SupportNav openCount={openCount} consoleHref={consoleHref} consoleLabel={consoleLabel} />
        </nav>
        <div className="app-content">{children}</div>
      </div>
    </div>
  )
}
