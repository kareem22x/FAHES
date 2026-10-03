'use client'

import { useId } from 'react'
import { motion } from 'motion/react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { GlassPanel, GlassBadge } from '@/components/admin/ui/glass'
import { formatArabicNumber } from '@/lib/inspection-status'
import type { TrendPoint } from '@/lib/admin/store'

type Tone = 'sky' | 'emerald' | 'amber' | 'rose' | 'violet'

const accents: Record<Tone, { stroke: string; bar: string }> = {
  sky: { stroke: '#38bdf8', bar: 'bg-sky-400' },
  emerald: { stroke: '#34d399', bar: 'bg-emerald-400' },
  amber: { stroke: '#fbbf24', bar: 'bg-amber-400' },
  rose: { stroke: '#fb7185', bar: 'bg-rose-400' },
  violet: { stroke: '#a78bfa', bar: 'bg-violet-400' },
}

export type KpiTrend = { points: TrendPoint[]; key: 'users' | 'inspections' }

/**
 * KPI card with a 14-day sparkline.
 *
 * The delta compares the last 7 days against the 7 before it, which is a more
 * honest "is this moving?" signal than a flat total.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'sky',
  trend,
  suffix,
}: {
  label: string
  value: number
  hint?: string
  tone?: Tone
  trend?: KpiTrend
  suffix?: string
}) {
  const accent = accents[tone]
  // `useId` rather than the label: an SVG gradient id must be URL-safe, and the
  // labels here are Arabic.
  const gradientId = `kpi-${useId().replace(/:/g, '')}`
  const points = trend?.points ?? []
  const series = trend ? points.map((point) => ({ date: point.date, value: point[trend.key] })) : []

  let delta: number | null = null
  if (trend && points.length >= 14) {
    const half = Math.floor(points.length / 2)
    const previous = points.slice(0, half).reduce((sum, point) => sum + point[trend.key], 0)
    const recent = points.slice(half).reduce((sum, point) => sum + point[trend.key], 0)
    delta = previous === 0 ? (recent > 0 ? 100 : 0) : Math.round(((recent - previous) / previous) * 100)
  }

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <GlassPanel className="relative min-w-0 overflow-hidden p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-neutral-400">{label}</p>
            {/* Fluid value: stays legible at 320px, never dominates a 4-up row. */}
            <p className="mt-1.5 text-[clamp(20px,2.4vw,26px)] leading-tight font-medium text-white">
              {formatArabicNumber(value)}
              {suffix && <span className="mr-1 text-xs font-normal text-neutral-500">{suffix}</span>}
            </p>
          </div>
          {delta !== null && (
            <GlassBadge
              tone={delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral'}
              className="shrink-0"
            >
              {delta > 0 ? <TrendingUp className="size-3" /> : delta < 0 ? <TrendingDown className="size-3" /> : null}
              {delta > 0 ? '+' : ''}
              {formatArabicNumber(delta)}%
            </GlassBadge>
          )}
        </div>

        {hint && <p className="mt-1 text-[10px] text-neutral-500">{hint}</p>}

        {series.length > 0 && (
          <div className="mt-3 h-10" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent.stroke} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent.stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,10,10,.95)',
                    border: '1px solid rgba(255,255,255,.1)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#e5e5e5',
                  }}
                  labelStyle={{ color: '#a3a3a3', fontSize: 10 }}
                  formatter={(value) => [formatArabicNumber(Number(value)), '']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={accent.stroke}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                  isAnimationActive
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <span className={`absolute inset-x-0 bottom-0 h-px opacity-40 ${accent.bar}`} />
      </GlassPanel>
    </motion.div>
  )
}

/**
 * KPI ladder: 1 column on phones → 2 on tablets → 4 on desktops.
 * `minmax(0, 1fr)` (via grid-cols-N) is what stops a long number from pushing
 * a column wider than its share and creating horizontal overflow.
 */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  )
}
