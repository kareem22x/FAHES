'use client'

import { useState, useEffect } from 'react'
import type { InspectorLocation } from '@/lib/admin/extended-store'
import { inspectorLocationStatusLabels, inspectorLocationStatusTone } from '@/lib/admin/labels'

const statusColors: Record<string, string> = {
  available: '#10b981',
  en_route: '#f59e0b',
  inspecting: '#3b82f6',
  offline: '#94a3b8',
}

const statusDot: Record<string, string> = {
  available: 'bg-emerald-500',
  en_route: 'bg-amber-500',
  inspecting: 'bg-sky-500',
  offline: 'bg-slate-400',
}

// Eastern Province, Saudi Arabia rough bounds
// Lat: 24.5 - 27.5, Lng: 48.5 - 51.5
const MAP_BOUNDS = {
  minLat: 24.0,
  maxLat: 28.0,
  minLng: 48.0,
  maxLng: 52.0,
}

function project(lat: number, lng: number, width: number, height: number) {
  const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * width
  const y = height - ((lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * height
  return { x, y }
}

export function InspectorMapClient({ locations }: { locations: InspectorLocation[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // Auto-refresh indicator pulse
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000)
    return () => clearInterval(interval)
  }, [])

  const width = 600
  const height = 300

  const selectedLocation = locations.find((l) => l.id === selected)

  return (
    <div className="flex flex-col gap-3">
      {/* Map SVG */}
      <div className="relative overflow-hidden rounded-lg border border-[#e3eaf2] bg-gradient-to-b from-sky-50 to-slate-50">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minHeight: '250px' }}>
          {/* Background grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e3eaf2" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#grid)" />

          {/* City markers — Eastern Province cities */}
          {[
            { name: 'الدمام', lat: 26.42, lng: 50.10 },
            { name: 'الخبر', lat: 26.28, lng: 50.21 },
            { name: 'الجبيل', lat: 27.00, lng: 49.66 },
            { name: 'القطيف', lat: 26.52, lng: 50.01 },
            { name: 'الأحساء', lat: 25.38, lng: 49.58 },
          ].map((city) => {
            const pos = project(city.lat, city.lng, width, height)
            return (
              <g key={city.name}>
                <circle cx={pos.x} cy={pos.y} r="4" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
                <text x={pos.x + 8} y={pos.y + 4} fontSize="10" fill="#64748b" fontWeight="500">
                  {city.name}
                </text>
              </g>
            )
          })}

          {/* Inspector location markers */}
          {locations.map((loc) => {
            const pos = project(loc.latitude, loc.longitude, width, height)
            const color = statusColors[loc.status] ?? '#94a3b8'
            const isMock = loc.is_mock_location
            return (
              <g key={loc.id} onClick={() => setSelected(loc.id)} style={{ cursor: 'pointer' }}>
                {/* Pulse ring for active inspectors */}
                {(loc.status === 'inspecting' || loc.status === 'en_route') && (
                  <circle cx={pos.x} cy={pos.y} r="12" fill={color} opacity="0.2">
                    <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={selected === loc.id ? 8 : 6}
                  fill={isMock ? '#ef4444' : color}
                  stroke="white"
                  strokeWidth="2"
                />
                {isMock && (
                  <text x={pos.x + 10} y={pos.y - 5} fontSize="9" fill="#ef4444" fontWeight="bold">
                    ⚠
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Legend overlay */}
        <div className="absolute bottom-2 right-2 rounded-lg border border-[#e3eaf2] bg-white/90 px-3 py-2 backdrop-blur">
          <div className="flex flex-col gap-1 text-[10px]">
            {Object.entries(statusColors).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: color }} />
                <span className="text-[#475d78]">{inspectorLocationStatusLabels[status] ?? status}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-red-500" />
              <span className="text-[#475d78]">موقع مزيف</span>
            </div>
          </div>
        </div>

        {/* Live indicator */}
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-700 ring-1 ring-emerald-200">
          <span className="relative inline-flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          مباشر
        </div>
      </div>

      {/* Selected inspector detail */}
      {selectedLocation && (
        <div className="rounded-lg border border-[#e3eaf2] bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#102444]">{selectedLocation.inspector_name}</p>
              <p className="text-[11px] text-[#65768d]">
                {selectedLocation.inspector_phone || 'لا رقم'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedLocation.is_mock_location && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200">
                  موقع مزيف
                </span>
              )}
              <span
                className={`inline-block size-2 rounded-full ${statusDot[selectedLocation.status] ?? 'bg-slate-400'}`}
              />
              <span className="text-[11px] text-[#475d78]">
                {inspectorLocationStatusLabels[selectedLocation.status] ?? selectedLocation.status}
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-[10px] text-[#65768d]">
            <div><span className="block text-[#94a3b8]">الإحداثيات</span><span className="font-mono text-[#475d78]">{selectedLocation.latitude.toFixed(4)}، {selectedLocation.longitude.toFixed(4)}</span></div>
            <div><span className="block text-[#94a3b8]">السرعة</span><span className="text-[#475d78]">{selectedLocation.speed.toFixed(1)} كم/س</span></div>
            <div><span className="block text-[#94a3b8]">الاتجاه</span><span className="text-[#475d78]">{selectedLocation.heading.toFixed(0)}°</span></div>
            <div><span className="block text-[#94a3b8]">البطارية</span><span className="text-[#475d78]">{selectedLocation.battery_level != null ? `${selectedLocation.battery_level}%` : '—'}</span></div>
          </div>
        </div>
      )}
    </div>
  )
}
