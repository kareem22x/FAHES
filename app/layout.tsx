import { ClerkProvider } from '@clerk/nextjs';
import { arSA } from '@clerk/localizations'
import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import MotionProvider from '@/components/motion-provider'
import ScrollReveal from '@/components/scroll-reveal'
import './globals.css'
import './refresh.css'

export const metadata: Metadata = {
  title: { default: 'فاحص | فحص سيارات الشرقية وأنت في مدينة ثانية', template: '%s | فاحص' },
  description: 'اطلب فحص سيارة في مدن ومحافظات المنطقة الشرقية، واستلم تقرير الفحص أينما كنت.',
  openGraph: { title: 'فاحص | سيارتك بالشرقية؟ نفحصها عنك.', description: 'فاحص يزور موقع السيارة في المنطقة الشرقية ويرسل لك تقريرًا واضحًا وأنت في مدينة ثانية.', locale: 'ar_SA', type: 'website' },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f5f8fd',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <ClerkProvider localization={arSA}>
          <MotionProvider>
            <ScrollReveal />
            {children}
          </MotionProvider>
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ClerkProvider>
      </body>
    </html>
  )
}
