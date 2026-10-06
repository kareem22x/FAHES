'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { AccountMenu } from '@/components/modules/account/account-menu'

const titles: Record<string, { title: string; hint: string }> = {
  '/support/tickets': { title: 'تذاكر الدعم الفني', hint: 'تابع مشكلاتك وتواصل مع فريق الدعم' },
}

/**
 * Topbar for the support area.
 *
 * The ticket detail page is a dynamic segment, so it is matched by prefix
 * rather than listed — a `[id]` route can never be a key in this map.
 */
export default function SupportTopbar() {
  const pathname = usePathname()

  const meta = titles[pathname]
    ?? (pathname.startsWith('/support/tickets/')
      ? { title: 'تفاصيل التذكرة', hint: 'المحادثة مع فريق الدعم وسجل الحالة' }
      : { title: 'مركز الدعم', hint: 'مساعدة ومتابعة' })

  return (
    <header className="app-topbar">
      <div className="app-topbar-title">
        <p>{meta.hint}</p>
        <h1>{meta.title}</h1>
      </div>
      <div className="app-topbar-actions">
        <Link href="/help" className="app-icon-button" aria-label="مركز المساعدة"><LifeBuoy size={17} /></Link>
        <AccountMenu />
      </div>
    </header>
  )
}
