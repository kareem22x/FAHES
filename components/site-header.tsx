'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Menu, X } from 'lucide-react'
import BrandMark from '@/components/brand-mark'
import { AccountMenu, AccountMenuInline } from '@/components/account-menu'

export type HeaderNavItem = { href: string; label: string }

/**
 * Sticky public header: brand, section navigation, the account menu (avatar)
 * and the primary call to action. Below 900px the navigation collapses into a
 * panel that also carries the account links, so a signed-in customer can reach
 * طلباتي / لوحة التحكم from any phone without hunting for a login button.
 */
export default function SiteHeader({
  navigation,
  ctaHref = '/requests/new',
  ctaLabel = 'اطلب فحصًا',
  compact = false,
}: {
  navigation: HeaderNavItem[]
  ctaHref?: string
  ctaLabel?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className={`site-container site-header-inner ${compact ? 'is-compact' : ''}`}>
        <Link href="/" className="site-brand" aria-label="فاحص — الصفحة الرئيسية">
          <BrandMark className="site-brand-mark" priority />
          <span>فاحص<span className="site-brand-period">.</span></span>
        </Link>

        <nav className="site-nav" aria-label="التنقل الرئيسي">
          {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>

        <div className="site-header-actions">
          <AccountMenu />
          <Link href={ctaHref} className="site-button site-button-small shine">{ctaLabel} <ArrowLeft size={16} /></Link>
        </div>

        <button
          type="button"
          className="site-menu-toggle"
          aria-expanded={open}
          aria-controls="site-mobile-nav"
          aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div id="site-mobile-nav" className={`site-mobile-nav ${open ? 'is-open' : ''}`} hidden={!open}>
        <nav aria-label="قائمة الجوال">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
          <AccountMenuInline />
          <Link className="site-mobile-cta" href={ctaHref} onClick={() => setOpen(false)}>
            {ctaLabel} <ArrowLeft size={16} />
          </Link>
        </nav>
      </div>
    </header>
  )
}
