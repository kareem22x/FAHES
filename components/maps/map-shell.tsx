'use client'

import dynamic from 'next/dynamic'
import type { LeafletCanvasProps } from './leaflet-canvas'

/**
 * The only entry point to the map.
 *
 * `ssr: false` is the whole reason this wrapper exists. Leaflet reads `window`
 * while its module is being evaluated, so it cannot be imported from a server
 * component at all — and `next/dynamic` with `ssr: false` is not permitted
 * inside one either. A client component may do both, so the split is: the page
 * (server) renders this, this loads the canvas (client, browser only).
 *
 * The type is imported with `import type`, which TypeScript erases, so pulling
 * the props shape across does not drag the Leaflet module into the graph of any
 * component that merely wants to describe a map.
 */
const LeafletCanvas = dynamic(() => import('./leaflet-canvas'), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

/**
 * Shown while the Leaflet chunk downloads.
 *
 * Sized to the real map so the card does not jump when the tiles arrive — the
 * alternative, a short spinner, makes the whole page reflow a moment after it
 * has been read.
 */
function MapSkeleton({ minHeight = 320 }: { minHeight?: number }) {
  return (
    <div
      className="fahes-map-frame flex items-center justify-center border border-[#e3eaf2]"
      style={{ '--fahes-map-min-height': `${minHeight}px` } as React.CSSProperties}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-2">
        <span
          className="size-6 animate-spin rounded-full border-2 border-[#dbe6f2] border-t-[#3b82f6]"
          aria-hidden="true"
        />
        <span className="text-[11px] text-[#65768d]">جارٍ تحميل الخريطة…</span>
      </div>
    </div>
  )
}

export type { LeafletCanvasProps }

export function MapShell(props: LeafletCanvasProps) {
  return <LeafletCanvas {...props} />
}
