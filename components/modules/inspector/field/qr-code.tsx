'use client'

import { useMemo } from 'react'
import { encodeQr } from '@/lib/field/qr'

/**
 * Renders a QR symbol from a payload.
 *
 * Drawn as a single `<path>` of unit squares rather than one `<rect>` per
 * module: a version-6 symbol is ~1 500 dark modules, and 1 500 DOM nodes on a
 * phone is a measurable cost for something that never changes. The path is
 * built once per payload with `useMemo`.
 *
 * `shapeRendering="crispEdges"` is load-bearing — without it the browser
 * antialiases module boundaries and a scanner can fail on exactly the symbols
 * rendered at a fractional device-pixel ratio, which is most phones.
 */
export function QrCode({
  value,
  className,
  title,
}: {
  value: string
  className?: string
  title?: string
}) {
  const symbol = useMemo(() => {
    try {
      return encodeQr(value)
    } catch {
      return null
    }
  }, [value])

  if (!symbol) {
    return (
      <span role="alert" className="field-qr-link">
        تعذّر توليد رمز QR لهذا الرابط.
      </span>
    )
  }

  const { size, modules } = symbol
  // One module of quiet zone on each side, per the spec's minimum.
  const quiet = 1
  const extent = size + quiet * 2

  const path: string[] = []
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!modules[row][col]) continue
      path.push(`M${col + quiet} ${row + quiet}h1v1h-1z`)
    }
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? 'رمز QR للتقارير'}
    >
      <rect width={extent} height={extent} fill="#f8fafc" />
      <path d={path.join('')} fill="#0b0f17" />
    </svg>
  )
}
