import { ClerkProvider } from '@clerk/nextjs';
import { arSA } from '@clerk/localizations'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import MotionProvider from '@/components/motion-provider'
import ScrollReveal from '@/components/scroll-reveal'
import DesignSystemInit from '@/components/design-system-init'
import PageTransition from '@/components/page-transition'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'
import './motion.css'
import './refresh.css'
import './design-system.css'
import 'swiper/css'
import 'yet-another-react-lightbox/styles.css'

/**
 * شبكة أمان لمحرّك الظهور عند التمرير (`/css-system/animations.js`).
 *
 * الحالة المخفيّة للعناصر الموسومة بـ data-reveal مُقيَّدة بصنف `ds-js` على
 * `<html>` — فإن لم يصل المحرّك إطلاقًا بقيت الصفحة فارغة. لذا نُزيل الصنف بعد
 * مهلة قصيرة إن لم يكن `window.Reveal` موجودًا، فتعود كل العناصر ظاهرة.
 */
const REVEAL_FAILSAFE = "setTimeout(function(){if(!window.Reveal){document.documentElement.classList.remove('ds-js')}},2500)"

export const metadata: Metadata = {
  title: { default: 'فاحص | فحص سيارات الشرقية وأنت في مدينة ثانية', template: '%s | فاحص' },
  description: 'اطلب فحص سيارة في مدن ومحافظات المنطقة الشرقية، واستلم تقرير الفحص أينما كنت.',
  openGraph: { title: 'فاحص | سيارتك بالشرقية؟ نفحصها عنك.', description: 'فاحص يزور موقع السيارة في المنطقة الشرقية ويرسل لك تقريرًا واضحًا وأنت في مدينة ثانية.', locale: 'ar_SA', type: 'website' },

  /* ── PWA ──────────────────────────────────────────────────────────────
     `manifest` is the one tag PWABuilder hard-requires; everything else it
     reads comes out of `public/manifest.json`.

     The favicon and the Apple touch icon are NOT listed under `icons` here:
     `app/icon.png` and `app/apple-icon.png` already make Next emit those
     `<link>` tags from the file convention. Declaring them again would emit
     duplicate tags pointing at the same artwork.

     `statusBarStyle: 'default'` rather than `'black-translucent'`: translucent
     lets page content slide under the iOS status bar, and this app is
     light-themed with a white topbar, so a black-on-light bar is both the
     readable choice and the one that needs no extra inset padding. */
  applicationName: 'Fahes',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Fahes' },
  /* Next 16 emits the standardised `mobile-web-app-capable` for the `capable`
     flag above. iOS only started honouring that name in 17.4; anything older
     still looks for the `apple-` prefixed spelling, and without it a
     home-screen bookmark opens in Safari with browser chrome instead of
     full-screen. Emitting both is the standard belt-and-braces: they are
     distinct meta names, so there is no duplicate-tag problem. */
  other: { 'apple-mobile-web-app-capable': 'yes' },
  /* The phone numbers on this site are displayed as text, not as dial links —
     iOS auto-linking them turned account and order numbers into tel: links. */
  formatDetection: { telephone: false, date: false, address: false, email: false },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  /* Near-black, per the PWA spec the product asked for. The app itself stays
     light: this paints the Android status bar and the browser's own chrome, so
     an installed app reads as a native one with a dark system bar above a light
     surface. It matches `theme_color` in the manifest and the icon background. */
  themeColor: '#09090b',
  // Lock the layout viewport to the device width so the CSS breakpoint ladder
  // (sm/md/lg/xl/2xl) matches the physical screen. `viewportFit: cover` exposes
  // env(safe-area-inset-*) so the notch and home indicator are handled by CSS
  // rather than by guessing at padding. Zoom is left unrestricted (max 5x) —
  // disabling pinch-zoom is an accessibility failure.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
      `className="ds-js"` MUST be rendered here rather than added by an inline
      script. React re-reconciles the attributes of `<html>` while hydrating and
      drops any class it did not render itself — an inline script's class shows
      up for one frame and is then removed, which silently disabled every
      scroll-reveal on the site. Declaring it in JSX makes it stick.

      Without JavaScript nothing is hidden: the `<noscript>` block below
      neutralises the hidden state.
    */
    <html lang="ar" dir="rtl" className="ds-js" suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: REVEAL_FAILSAFE }} />
        <noscript>
          {/* بدون JavaScript لا توجد حركة، فالاحتياط هو إظهار كل شيء فورًا */}
          <style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        <ClerkProvider localization={arSA}>
          <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            <MotionProvider>
              {/*
                Root layout wrapper.
                - `min-h-dvh` instead of `min-h-screen`: `100vh` on iOS/Android
                  includes the collapsing browser chrome, which pushes the last
                  element below the fold. `dvh` tracks the visible viewport.
                - `w-full max-w-full overflow-x-clip` is the last line of defence
                  for horizontal overflow (the primary guard lives on html/body).
                - `isolate` creates a stacking context so the sticky headers in
                  the shells cannot end up under an unrelated z-index elsewhere.
              */}
              <div className="rc-root isolate flex min-h-dvh w-full max-w-full flex-col overflow-x-clip">
                <ScrollReveal />
                <DesignSystemInit />
                <PwaRegister />
                <PageTransition>{children}</PageTransition>
                <Toaster position="bottom-center" dir="rtl" theme="light" richColors closeButton />
              </div>
            </MotionProvider>
          </ThemeProvider>
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ClerkProvider>
      </body>
    </html>
  )
}
