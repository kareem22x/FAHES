'use client'

import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function ExportReportPdfButton({ inspectionId }: { inspectionId: string }) {
  const [exporting, setExporting] = useState(false)

  async function exportPdf() {
    if (exporting) return
    const report = document.getElementById('inspection-report-content')
    if (!report) {
      toast.error('تعذر العثور على محتوى التقرير لتصديره.')
      return
    }

    setExporting(true)
    try {
      await document.fonts.ready
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(report, {
        backgroundColor: '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        logging: false,
        ignoreElements: (element) => element.hasAttribute('data-html2canvas-ignore')
          || element.matches('.report-media-dialog, [data-sonner-toaster]'),
        onclone: (clonedDocument) => {
          const wrapper = clonedDocument.querySelector<HTMLElement>('.report-media-swiper .swiper-wrapper')
          if (wrapper) {
            wrapper.style.transform = 'none'
            wrapper.style.flexWrap = 'wrap'
            wrapper.style.gap = '12px'
          }
          clonedDocument.querySelectorAll<HTMLElement>('.report-media-swiper .swiper-slide').forEach((slide) => {
            slide.style.width = 'calc(50% - 6px)'
            slide.style.marginLeft = '0'
          })
          clonedDocument.querySelectorAll('video').forEach((video) => {
            const placeholder = clonedDocument.createElement('div')
            placeholder.className = 'report-pdf-video-placeholder'
            placeholder.textContent = 'مقطع فيديو مرفق — شاهده من صفحة التقرير'
            video.replaceWith(placeholder)
          })
        },
      })
      if (canvas.width === 0 || canvas.height === 0) throw new Error('تعذر تحويل التقرير إلى صورة.')

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imageHeight = canvas.height * pageWidth / canvas.width
      const image = canvas.toDataURL('image/jpeg', 0.92)
      let y = 0
      let page = 0
      while (y > -imageHeight) {
        if (page > 0) pdf.addPage()
        pdf.addImage(image, 'JPEG', 0, y, pageWidth, imageHeight, undefined, 'FAST')
        y -= pageHeight
        page += 1
      }
      pdf.save(`تقرير-فاحص-${inspectionId}.pdf`)
      toast.success('تم تجهيز التقرير بصيغة PDF.')
    } catch (error) {
      console.error('Inspection report PDF export failed', error)
      toast.error('تعذر إنشاء PDF. يمكنك استخدام خيار «طباعة التقرير» لحفظ نسخة.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={() => void exportPdf()} disabled={exporting} aria-busy={exporting}>
      {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download size={16} />}
      {exporting ? 'جارٍ تجهيز PDF' : 'تنزيل PDF'}
    </button>
  )
}
