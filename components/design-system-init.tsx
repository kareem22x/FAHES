'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * يشغّل محرّك الظهور عند التمرير (`/css-system/animations.js`).
 *
 * المحرّك يعتمد على IntersectionObserver فقط، بلا أي مكتبة، ويُظهر العناصر
 * الموسومة بـ `data-reveal` (وأنماطه في `app/design-system.css`).
 *
 * - السكربت يشغّل نفسه تلقائيًا عند التحميل.
 * - `refresh()` عند تغيير المسار: موجّه App Router يركّب الشجرة الجديدة
 *   *بعد* إنشاء المراقب، فيلزم إعادة المسح. (المحرّك يراقب DOM أيضًا،
 *   وهذا احتياط إضافي.)
 */

type RevealApi = {
  init: (options?: Record<string, unknown>) => unknown
  refresh: (root?: Element | Document) => unknown
  reset: (root?: Element | Document) => unknown
  revealAll: (root?: Element | Document) => unknown
  destroy: () => unknown
}

declare global {
  interface Window {
    Reveal?: RevealApi
  }
}

export default function DesignSystemInit() {
  const pathname = usePathname()

  useEffect(() => {
    window.Reveal?.refresh()
  }, [pathname])

  return (
    <Script
      id="fahes-design-system"
      src="/css-system/animations.js"
      strategy="afterInteractive"
    />
  )
}
