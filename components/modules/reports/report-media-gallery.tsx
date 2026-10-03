'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react'
import { Swiper, SwiperSlide } from 'swiper/react'
import Lightbox, { type Slide } from 'yet-another-react-lightbox'
import Video from 'yet-another-react-lightbox/plugins/video'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import type { InspectionReportMedia } from '@/types/inspection-report'

function PdfPreview({ media }: { media: InspectionReportMedia }) {
  return (
    <div className="report-media-document">
      <FileText size={34} />
      <strong>{media.fileName || 'ملف PDF'}</strong>
      <iframe src={media.url} title={media.fileName || 'معاينة ملف PDF'} sandbox="allow-same-origin" />
      <a href={media.url} target="_blank" rel="noreferrer">فتح ملف PDF في نافذة جديدة</a>
    </div>
  )
}

export default function ReportMediaGallery({ media }: { media: InspectionReportMedia[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeSlideIndex, setActiveSlideIndex] = useState<number | null>(null)
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const visualMedia = useMemo(() => media.filter((file) => file.type !== 'document'), [media])
  const documents = useMemo(() => media.filter((file) => file.type === 'document'), [media])
  const activeDocumentIndex = documents.findIndex((file) => file.id === activeDocumentId)
  const activeDocument = activeDocumentIndex < 0 ? null : documents[activeDocumentIndex]
  const slides = useMemo<Slide[]>(() => visualMedia.map((file) => file.type === 'video'
    ? {
      type: 'video',
      sources: [{ src: file.url, type: file.mimeType }],
      controls: true,
      playsInline: true,
      preload: 'metadata',
    }
    : { src: file.url, alt: `${file.category} — ${file.fileName || 'صورة من الفحص'}` }), [visualMedia])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (activeDocument && !dialog.open) dialog.showModal()
    if (!activeDocument && dialog.open) dialog.close()
  }, [activeDocument])

  function moveDocument(direction: -1 | 1) {
    if (activeDocumentIndex < 0 || documents.length < 2) return
    const nextIndex = (activeDocumentIndex + direction + documents.length) % documents.length
    setActiveDocumentId(documents[nextIndex].id)
  }

  if (media.length === 0) return <p className="app-panel-note">لم يرفق الفاحص صورًا أو فيديو أو ملفات PDF لهذا التقرير.</p>

  return (
    <>
      <Swiper
        dir="rtl"
        className="report-media-swiper"
        slidesPerView={1.18}
        spaceBetween={12}
        breakpoints={{
          560: { slidesPerView: 2.1 },
          900: { slidesPerView: 2.7 },
        }}
        aria-label="مرفقات تقرير الفحص"
      >
        {media.map((file, index) => {
          const visualIndex = visualMedia.findIndex((item) => item.id === file.id)
          return (
            <SwiperSlide key={file.id}>
              <button
                type="button"
                className="app-media-item"
                onClick={() => file.type === 'document' ? setActiveDocumentId(file.id) : setActiveSlideIndex(visualIndex)}
                aria-label={`فتح ${file.fileName || file.category}، ${index + 1} من ${media.length}`}
              >
                {file.type === 'image'
                  // eslint-disable-next-line @next/next/no-img-element -- Signed private-media URLs expire after five minutes.
                  ? <img src={file.url} alt={file.category} />
                  : file.type === 'video'
                    ? <video src={file.url} preload="metadata" aria-label={file.category} />
                    : <span className="app-media-document"><FileText size={30} /><strong>PDF</strong></span>}
                <span><strong>{file.category}</strong><small>{file.fileName || (file.type === 'document' ? 'ملف PDF' : file.type === 'video' ? 'فيديو' : 'صورة')}</small></span>
              </button>
            </SwiperSlide>
          )
        })}
      </Swiper>

      <Lightbox
        open={activeSlideIndex !== null}
        close={() => setActiveSlideIndex(null)}
        index={activeSlideIndex ?? 0}
        slides={slides}
        plugins={[Video, Zoom]}
        zoom={{ scrollToZoom: true, maxZoomPixelRatio: 2.5 }}
        labels={{
          Previous: 'المرفق السابق',
          Next: 'المرفق التالي',
          Close: 'إغلاق',
          Slide: 'مرفق',
          Carousel: 'عارض المرفقات',
          Lightbox: 'معرض مرفقات تقرير الفحص',
          'Photo gallery': 'معرض صور الفحص',
          '{index} of {total}': '{index} من {total}',
        }}
        video={{ controls: true, playsInline: true, preload: 'metadata' }}
      />

      <dialog
        ref={dialogRef}
        className="report-media-dialog"
        aria-label="معاينة ملف PDF من تقرير الفحص"
        onClose={() => setActiveDocumentId(null)}
      >
        {activeDocument && (
          <div className="report-media-viewer">
            <header>
              <div><strong>{activeDocument.category}</strong><span>{activeDocument.fileName || activeDocument.mimeType}</span></div>
              <button type="button" className="report-media-close" onClick={() => setActiveDocumentId(null)} aria-label="إغلاق المعاينة"><X size={20} /></button>
            </header>
            <div className="report-media-viewer-content">
              <button type="button" onClick={() => moveDocument(-1)} disabled={documents.length < 2} aria-label="ملف PDF السابق"><ChevronRight size={22} /></button>
              <PdfPreview media={activeDocument} />
              <button type="button" onClick={() => moveDocument(1)} disabled={documents.length < 2} aria-label="ملف PDF التالي"><ChevronLeft size={22} /></button>
            </div>
            <footer>
              <span>{activeDocumentIndex + 1} من {documents.length}</span>
              <a href={activeDocument.url} target="_blank" rel="noreferrer" download={activeDocument.fileName || undefined}>تنزيل ملف PDF</a>
            </footer>
          </div>
        )}
      </dialog>
    </>
  )
}
