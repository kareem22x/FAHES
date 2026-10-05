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
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5f8fd',
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
