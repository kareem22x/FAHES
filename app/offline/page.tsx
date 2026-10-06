'use client'

import BrandMark from '@/components/brand-mark'

/**
 * The offline fallback the service worker precaches.
 *
 * Deliberately a client component with no data access and no `next/link`: it is
 * served from the cache when the network is gone, so it must render with
 * nothing but the already-cached JS/CSS. "Try again" does a real
 * `location.reload()` rather than a client-side navigation — a soft navigation
 * would fail against the same dead network, whereas a reload lets the browser
 * re-enter the worker's navigate path and go back to the network first.
 *
 * Inline styles rather than utility classes: this page is the last thing
 * standing when asset loading has gone wrong, so it carries its own styling
 * instead of depending on a stylesheet having been cached.
 */
export default function OfflinePage() {
  return (
    <main
      dir="rtl"
      style={{
        display: 'flex',
        minHeight: '100dvh',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: '32px 20px calc(32px + env(safe-area-inset-bottom, 0px))',
        background: 'var(--color-background, #f5f8fd)',
        color: 'var(--color-text, #0f2444)',
        textAlign: 'center',
      }}
    >
      <BrandMark className="app-logo-mark" />

      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          border: '1px solid var(--color-border, #e2eaf4)',
          borderRadius: 999,
          background: 'var(--color-surface, #fff)',
          padding: '7px 14px',
          color: 'var(--color-text-muted, #5f7086)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span
          style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber-600, #b0741b)' }}
        />
        لا يوجد اتصال
      </span>

      <h1 style={{ margin: 0, fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 800, letterSpacing: '-.02em' }}>
        تعذّر الوصول إلى الإنترنت
      </h1>

      <p
        style={{
          maxWidth: 420,
          margin: 0,
          color: 'var(--color-text-muted, #5f7086)',
          fontSize: 13.5,
          lineHeight: 1.9,
        }}
      >
        تحقّق من اتصالك ثم أعد المحاولة. طلباتك وتقاريرك محفوظة، وستظهر فور عودة الشبكة.
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          display: 'inline-flex',
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          border: 0,
          borderRadius: 'var(--radius-sm, 10px)',
          background: 'var(--brand-500, #2563EB)',
          padding: '12px 24px',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          touchAction: 'manipulation',
          boxShadow: 'var(--shadow-brand, 0 12px 30px rgb(13 116 227 / 24%))',
        }}
      >
        إعادة المحاولة
      </button>
    </main>
  )
}
