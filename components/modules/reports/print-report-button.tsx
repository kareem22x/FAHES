'use client'

import { Printer } from 'lucide-react'

export default function PrintReportButton() {
  return (
    <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
      <Printer size={16} /> طباعة التقرير
    </button>
  )
}
