import { cn } from '@/lib/utils'

/**
 * Route-level loading skeletons.
 *
 * ── Why these exist ────────────────────────────────────────────────────────
 *
 * The project had no `loading.tsx` anywhere. Every `router.push` into a
 * server-rendered route therefore left the *previous* screen frozen and
 * unresponsive until the new one finished — which reads as "the UI thread
 * locked", even though nothing was blocked. A `loading.tsx` gives the App
 * Router a Suspense boundary to stream into, so the click produces an immediate
 * visual change and the navigation feels instant even when the query is slow.
 *
 * ── Why two components ─────────────────────────────────────────────────────
 *
 * They sit at different depths and see different things:
 *
 *   * `AppSkeleton` is for `app/loading.tsx`, which is *above* every layout.
 *     At that point no sidebar or topbar exists, so it must be a neutral
 *     full-page placeholder rather than a fake shell that would then be
 *     replaced by a differently-shaped one.
 *   * `RouteSkeleton` is for a segment (`app/dashboard/loading.tsx`), which
 *     renders *inside* that segment's layout. The shell is already on screen
 *     and stable, so only the content area needs a placeholder.
 *
 * Both are deliberately structural rather than branded: a skeleton that guesses
 * wrong is worse than one that is plainly a placeholder, because the content
 * then appears to jump.
 */

function Block({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-[#e9eff6]', className)} />
}

/**
 * Full-page placeholder for `app/loading.tsx`.
 *
 * Shown while a route's *layout* resolves — the layout is what performs the
 * session read and the first data fetch, so this is the gap the user actually
 * stares at. It is intentionally quiet: a spinner in the middle of an otherwise
 * empty page, not a fake interface.
 */
export function AppSkeleton() {
  return (
    <div
      dir="rtl"
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="grid min-h-[70vh] place-items-center px-6"
    >
      <div className="flex flex-col items-center gap-4">
        <span className="relative grid size-12 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#0b5cad]/15" />
          <span className="relative size-3 rounded-full bg-[#0b5cad]" />
        </span>
        <p className="text-[12px] font-medium text-[#65768d]">جارٍ التحميل…</p>
      </div>
    </div>
  )
}

export type SkeletonShape = 'cards' | 'list' | 'thread' | 'panel'

/**
 * Content-area placeholder for a segment's `loading.tsx`.
 *
 * `shape` picks the silhouette that best matches the destination so the real
 * content settles in rather than replacing it wholesale:
 *
 *   * `cards`  — a stat grid (dashboards, consoles)
 *   * `list`   — stacked rows (ticket queues, order lists, tables)
 *   * `thread` — a message conversation with a composer
 *   * `panel`  — a single settings/forms panel
 */
export function RouteSkeleton({
  shape = 'panel',
  title,
  rows = 5,
}: {
  shape?: SkeletonShape
  /** Optional page title, shown as a real heading so the route is announced. */
  title?: string
  rows?: number
}) {
  return (
    <div dir="rtl" role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{title ? `${title} — جارٍ التحميل…` : 'جارٍ التحميل…'}</span>

      {title && (
        <div>
          <h1 className="text-lg font-bold text-[#102444]">{title}</h1>
          <p className="mt-1 text-[11px] text-[#65768d]">جارٍ تحميل البيانات…</p>
        </div>
      )}

      {shape === 'cards' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-[#e3eaf2] bg-white p-4">
                <Block className="h-3 w-16" />
                <Block className="mt-3 h-7 w-12" />
                <Block className="mt-3 h-2.5 w-20" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[#e3eaf2] bg-white p-4">
            <Block className="h-3 w-24" />
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: rows }).map((_, index) => (
                <Block key={index} className="h-9 w-full" />
              ))}
            </div>
          </div>
        </>
      )}

      {shape === 'list' && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="rounded-xl border border-[#e3eaf2] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <Block className="h-3.5 w-40" />
                <Block className="h-5 w-16 rounded-full" />
              </div>
              <Block className="mt-3 h-2.5 w-full max-w-[420px]" />
              <Block className="mt-2 h-2.5 w-28" />
            </div>
          ))}
        </div>
      )}

      {shape === 'thread' && (
        <>
          <div className="rounded-xl border border-[#e3eaf2] bg-white p-4">
            <Block className="h-3.5 w-48" />
            <Block className="mt-3 h-2.5 w-32" />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-[#e3eaf2] bg-white p-4">
            {Array.from({ length: rows }).map((_, index) => (
              <div
                key={index}
                className={cn('flex', index % 2 === 0 ? 'justify-start' : 'justify-end')}
              >
                <Block className={cn('h-14', index % 2 === 0 ? 'w-3/5' : 'w-2/5')} />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[#e3eaf2] bg-white p-4">
            <Block className="h-16 w-full" />
            <Block className="mt-3 h-8 w-24 rounded-lg" />
          </div>
        </>
      )}

      {shape === 'panel' && (
        <div className="rounded-xl border border-[#e3eaf2] bg-white p-5 sm:p-7">
          <Block className="h-3 w-24" />
          <Block className="mt-3 h-5 w-48" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Block key={index} className="h-10 w-full" />
            ))}
          </div>
          <Block className="mt-6 h-9 w-32 rounded-lg" />
        </div>
      )}
    </div>
  )
}
