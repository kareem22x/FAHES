import type { ComponentProps } from 'react'
import type { SignIn } from '@clerk/nextjs'

type Appearance = ComponentProps<typeof SignIn>['appearance']

/**
 * One Clerk look for both auth screens so the hosted forms match the product
 * palette instead of Clerk's default indigo. Variable names follow the Clerk 7
 * appearance API (`colorForeground`, `colorInput`, `colorMutedForeground`).
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: '#0d74e3',
    colorForeground: '#0f2444',
    colorMutedForeground: '#5f7086',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: '#0f2444',
    colorBorder: '#e2eaf4',
    colorRing: 'rgba(13, 116, 227, 0.18)',
    borderRadius: '14px',
    fontFamily: "'Inter', 'Noto Sans Arabic', Tahoma, Arial, sans-serif",
    fontSize: '15px',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none',
    card: 'w-full border border-[#e2eaf4] rounded-[20px] shadow-[0_18px_55px_rgba(10,31,68,.10)] p-6 sm:p-7',
    headerTitle: 'font-extrabold text-[#0f2444]',
    headerSubtitle: 'text-[#5f7086]',
    socialButtonsBlockButton: 'border-[#e2eaf4] rounded-xl hover:border-[#7bb6ff]',
    formFieldLabel: 'font-bold text-[#41546f]',
    formFieldInput: 'rounded-xl border-[#e2eaf4] focus:border-[#0d74e3]',
    formButtonPrimary: 'rounded-full font-bold shadow-[0_12px_30px_rgba(13,116,227,.24)] normal-case',
    footerActionLink: 'font-bold text-[#0a5cc0]',
    identityPreview: 'rounded-xl border-[#e2eaf4]',
    otpCodeFieldInput: 'rounded-xl',
    formResendCodeLink: 'font-bold text-[#0a5cc0]',
    dividerText: 'text-[#98a6b8]',
    badge: 'rounded-full',
    alert: 'rounded-xl',
  },
}
