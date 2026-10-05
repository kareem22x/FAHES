import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ملفي الشخصي — فاحص', robots: { index: false, follow: false } }

/**
 * Alias for the customer's profile screen.
 *
 * ── Why this is a redirect and not a page ──────────────────────────────────
 *
 * The customer workspace in this app lives under `/dashboard/*`, so the profile
 * is `/dashboard/profile` and that is what the account menu links to. This route
 * exists only because `/client/profile` is the name the platform brief specifies,
 * and external references — a support macro, a bookmark, an email — may use it.
 * Rendering the same screen at two URLs would mean two places to keep correct;
 * redirecting keeps exactly one.
 *
 * `/dashboard/profile` is the destination rather than a copy of the component
 * because it sits inside the customer shell (`app/dashboard/layout.tsx`), which
 * is where a customer expects to find their own profile.
 */
export default function ClientProfileAliasPage() {
  redirect('/dashboard/profile')
}
