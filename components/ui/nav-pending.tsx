'use client'

import { useLinkStatus } from 'next/link'

/**
 * A spinner that appears inside a `<Link>` while its navigation is in flight.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * "The navigation freezes" is almost never a blocked main thread. It is a
 * navigation that gives no feedback: the URL changes a second later and nothing
 * on screen acknowledged the click. `useLinkStatus` (Next 15.3+) exposes the
 * pending state of the `<Link>` it is rendered inside, which is the cheapest
 * honest fix — far better than swapping `<Link>` for `router.push` +
 * `useTransition`, which throws away prefetching and open-in-new-tab.
 *
 * ── Why it is here and not in the profile dropdown ─────────────────────────
 *
 * The hook only reports pending while its `<Link>` is *mounted*. A dropdown menu
 * has to close the instant it is clicked — leave it open and it hangs there after
 * navigating between two pages that share a layout, which is the common case
 * (`/inspector/dashboard` and `/inspector/settings` both sit under
 * `app/inspector/layout.tsx`, so the shell never remounts). Closing it unmounts
 * this spinner before it can paint a single frame.
 *
 * A shell's sidebar has the opposite property: its layout persists across sibling
 * navigation, so the `<Link>` stays mounted for the whole transition and the
 * spinner is actually visible. That makes the sidebar the one place the feedback
 * the brief asked for can be shown.
 *
 * Rendered as a direct child of `<Link>`. `role="status"` so assistive tech
 * announces the wait instead of the view changing silently.
 */
export function NavPending({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <span
      role="status"
      aria-label="جارٍ التحميل"
      className={`size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`}
    />
  )
}
