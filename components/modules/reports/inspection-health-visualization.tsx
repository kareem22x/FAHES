'use client'

import { motion } from 'framer-motion'
import CountUp from 'react-countup'
import { useInView } from 'react-intersection-observer'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Gauge } from 'lucide-react'
import { formatArabicNumber } from '@/lib/inspection-status'
import type { InspectionHealthScore, InspectionSectionHealth } from '@/lib/inspection-report'

export default function InspectionHealthVisualization({
  health,
  sections,
}: {
  health: InspectionHealthScore
  sections: InspectionSectionHealth[]
}) {
  const [chartRef, chartInView] = useInView({ triggerOnce: true, threshold: 0.15 })
  const chartSections = sections.filter((section) => section.assessedItems > 0)

  return (
    <motion.section
      className="app-panel app-health-panel"
      aria-label="مؤشر بنود حالة المركبة"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
    >
      <div
        role="img"
        className="app-health-gauge"
        style={{ background: `conic-gradient(var(--brand-500) ${health.score ?? 0}%, var(--color-border-light) 0)` }}
        aria-label={health.score === null ? 'لا يتوفر مؤشر' : `المؤشر ${formatArabicNumber(health.score)} بالمئة`}
      >
        <span>
          {health.score === null
            ? '—'
            : <CountUp end={health.score} duration={1.25} formattingFn={(value) => formatArabicNumber(Math.round(value))} />}
          {health.score !== null && '٪'}
        </span>
      </div>
      <div className="app-health-copy">
        <span className="app-eyebrow"><Gauge size={14} /> مؤشر استرشادي</span>
        <h2>{health.score === null ? 'لا تتوفر بنود قابلة للحساب' : 'مؤشر حالة البنود القابلة للتقييم'}</h2>
        <p>احتُسب من {formatArabicNumber(health.assessedItems)} بندًا: «سليم» 100، «ملاحظة» 50، «متضرر» 0. لا يمثل تشخيصًا ميكانيكيًا أو تقييمًا معتمدًا للمركبة.</p>
        {(health.excluded.painted + health.excluded.replaced + health.excluded.unknown) > 0 && (
          <div className="app-health-exclusions">
            {health.excluded.painted > 0 && <span>مرشوش: {formatArabicNumber(health.excluded.painted)}</span>}
            {health.excluded.replaced > 0 && <span>مستبدل: {formatArabicNumber(health.excluded.replaced)}</span>}
            {health.excluded.unknown > 0 && <span>غير معروف: {formatArabicNumber(health.excluded.unknown)}</span>}
            <small>هذه النتائج ظاهرة في التقرير لكنها مستبعدة من المؤشر.</small>
          </div>
        )}
      </div>

      <div className="app-health-breakdown" ref={chartRef}>
        <div className="app-health-breakdown-heading">
          <h3>توزيع النتائج حسب القسم</h3>
          <span>من ١٠٠</span>
        </div>
        {chartSections.length > 0 ? (
          <>
            <div className="app-health-chart" role="img" aria-label="مخطط أفقي لمؤشر الفحص لكل قسم">
              <ResponsiveContainer width="100%" height={Math.max(240, chartSections.length * 38)}>
                <BarChart data={chartSections} layout="vertical" margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke="#e6edf6" />
                  <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: '#718096', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="title" type="category" width={105} orientation="right" tick={{ fill: '#263d5b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: '#eff6ff' }}
                    formatter={(value) => [`${formatArabicNumber(Number(value ?? 0))}٪`, 'المؤشر']}
                    labelFormatter={(label) => String(label)}
                  />
                  <Bar dataKey="score" name="المؤشر" radius={[0, 6, 6, 0]} maxBarSize={18} isAnimationActive={chartInView} animationDuration={750}>
                    {chartSections.map((section) => (
                      <Cell key={section.id} fill={section.score !== null && section.score < 50 ? '#f59e0b' : '#2563eb'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="sr-only">
              {chartSections.map((section) => (
                <li key={section.id}>{section.title}: {formatArabicNumber(section.score ?? 0)}٪ من {formatArabicNumber(section.assessedItems)} بندًا</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="app-health-chart-empty">تظهر مقارنة الأقسام بعد تسجيل نتائج قابلة للتقييم.</p>
        )}
      </div>
    </motion.section>
  )
}
