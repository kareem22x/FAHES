'use client'

import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, CloudUpload, Gauge, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { CameraCapture } from '@/components/ui/camera-capture'
import { mandatoryPhotoSequence, type VerificationPhoto } from '@/lib/field/types'
import { useHaptics } from './field-hooks'

/**
 * Pre-inspection verification.
 *
 * Three things must be true before the checklist unlocks, because they are the
 * three things that make the subsequent report defensible:
 *
 *   1. the odometer reading is recorded numerically;
 *   2. the plate the inspector is looking at matches the order;
 *   3. the four legally-required photos exist.
 *
 * The browser enforces this; the server re-checks it. A workflow that is only
 * enforced in the client is a workflow that can be skipped.
 */
export function FieldVerification({
  inspectionId,
  plateNumber,
  initialOdometer,
  initialPlateConfirmed,
  initialPhotos,
  required = true,
}: {
  inspectionId: string
  plateNumber: string
  initialOdometer: number | null
  initialPlateConfirmed: boolean
  initialPhotos: VerificationPhoto[]
  required?: boolean
}) {
  const haptics = useHaptics()
  const [odometer, setOdometer] = useState(initialOdometer === null ? '' : String(initialOdometer))
  const [plateConfirmed, setPlateConfirmed] = useState(initialPlateConfirmed)
  const [photos, setPhotos] = useState<VerificationPhoto[]>(initialPhotos)
  const [busy, setBusy] = useState<string | null>(null)
  const [savings, setSavings] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  /** The mandatory step whose in-app camera is currently open, or null. */
  const [cameraStep, setCameraStep] = useState<(typeof mandatoryPhotoSequence)[number] | null>(null)

  const odometerValue = Number.parseInt(odometer.replace(/[^\d]/g, ''), 10)
  const odometerValid = Number.isFinite(odometerValue) && odometerValue >= 0 && odometerValue <= 2_000_000
  const missingKeys = mandatoryPhotoSequence.filter(
    (step) => !photos.some((photo) => photo.key === step.key),
  )
  const complete = (!required || (odometerValid && plateConfirmed && missingKeys.length === 0))

  const persist = useCallback(
    async (patch: { odometerKm?: number; plateConfirmed?: boolean }) => {
      await fetch(`/api/inspector/field/${encodeURIComponent(inspectionId)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    },
    [inspectionId],
  )

  async function upload(key: string, category: string, file: File) {
    setBusy(key)
    setError('')
    try {
      const { compressImage, formatBytes } = await import('./field-hooks')
      const compressed = await compressImage(file)
      setSavings(
        compressed.compressedBytes < compressed.originalBytes
          ? `تم ضغط الصورة من ${formatBytes(compressed.originalBytes)} إلى ${formatBytes(compressed.compressedBytes)}`
          : null,
      )

      const form = new FormData()
      form.set('file', compressed.blob, compressed.fileName)
      form.set('category', category)
      form.set('phase', 'verification')
      form.set('verificationKey', key)

      const response = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/media`, {
        method: 'POST',
        body: form,
      })
      if (!response.ok) throw new Error('تعذّر رفع الصورة.')

      const saved = (await response.json()) as { media?: VerificationPhoto }
      haptics('success')
      if (saved.media) {
        setPhotos((current) => [...current.filter((photo) => photo.key !== key), { ...saved.media!, key: key as VerificationPhoto['key'] }])
      }
      toast.success('تم حفظ الصورة')
    } catch (cause) {
      haptics('error')
      setError(cause instanceof Error ? cause.message : 'تعذّر رفع الصورة.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="inspector-detail-card" aria-label="التحقق قبل الفحص">
      <div className="inspector-detail-card-heading">
        <div>
          <span className="inspector-section-kicker"><ShieldCheck size={14} /> خطوة إلزامية</span>
          <h2>التحقق والتوثيق المبدئي</h2>
        </div>
        <span className={`field-chip ${complete ? 'is-ok' : 'is-warn'}`}>
          {complete ? <><Check size={13} /> مكتمل</> : <><AlertTriangle size={13} /> ناقص</>}
        </span>
      </div>

      <div className="field-verify">
        <div className="field-odometer">
          <label htmlFor="field-odometer">
            <Gauge size={13} /> قراءة العداد (كم)
          </label>
          <div className="field-odometer-row">
            <input
              id="field-odometer"
              // `inputMode` numeric + `dir=ltr` so the keypad opens on phones and
              // the digits read left-to-right inside an RTL page.
              inputMode="numeric"
              dir="ltr"
              value={odometer}
              placeholder="000000"
              maxLength={7}
              onChange={(event) => setOdometer(event.target.value)}
              onBlur={() => {
                if (odometerValid) void persist({ odometerKm: odometerValue })
              }}
              aria-invalid={odometer !== '' && !odometerValid}
            />
            <span className="field-odometer-unit">كم</span>
          </div>
          {odometer !== '' && !odometerValid && <small className="field-trail-hash">أدخل قراءة صحيحة بين 0 و 2,000,000.</small>}
        </div>

        <label className="field-plate-confirm">
          <input
            type="checkbox"
            checked={plateConfirmed}
            onChange={(event) => {
              setPlateConfirmed(event.target.checked)
              haptics('tap')
              void persist({ plateConfirmed: event.target.checked })
            }}
          />
          <span>
            أؤكد أن لوحة المركبة <strong dir="ltr">{plateNumber || '—'}</strong> مطابقة للطلب المذكور.
          </span>
        </label>

        <div>
          <p className="inspector-checklist-disclaimer" style={{ marginBottom: 10 }}>
            الصور الإلزامية الأربع — تُضغط تلقائيًا قبل الرفع لتقليل استهلاك البيانات.
          </p>
          <div className="field-shots">
            {mandatoryPhotoSequence.map((step, index) => {
              const photo = photos.find((item) => item.key === step.key)
              const uploading = busy === step.key
              return (
                <div key={step.key} className={`field-shot ${photo ? 'is-done' : ''}`}>
                  <span className="field-shot-order">{photo ? <Check size={13} /> : index + 1}</span>
                  <strong>{step.label}</strong>
                  <small>{step.hint}</small>

                  {photo && photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Signed private-media URLs expire.
                    <img className="field-shot-preview" src={photo.url} alt={step.label} />
                  ) : photo ? (
                    /* The photo row exists but has no renderable URL yet: it was
                       captured offline and is still queued, or its signed URL has
                       not come back. `src=""` must never be rendered — the browser
                       reads it as "the current document" and re-downloads the whole
                       page as an image. Show a placeholder instead, without an `src`
                       attribute at all. */
                    <div className="field-shot-preview field-shot-preview-pending" role="img" aria-label={`${step.label} — قيد المزامنة`}>
                      <CloudUpload size={20} />
                      <span>قيد المزامنة</span>
                    </div>
                  ) : (
                    <div className="field-shot-target-wrap">
                      {/* Primary path: our own viewfinder, so the inspector can
                          frame the shot, check it, and retake without leaving
                          the page. */}
                      <button
                        type="button"
                        className="field-shot-target"
                        aria-label={`التقاط ${step.label}`}
                        disabled={uploading}
                        onClick={() => setCameraStep(step)}
                      >
                        {uploading ? <Loader2 size={22} /> : <Camera size={22} />}
                      </button>
                      {/* Fallback, not a duplicate. A denied camera permission or
                          a sensor held by another app must not block a photo the
                          workflow legally requires, and the system picker also
                          covers choosing an existing file from the gallery. */}
                      <label className="field-shot-gallery">
                        من المعرض
                        <input
                          ref={(node) => { inputRefs.current[step.key] = node }}
                          className="field-shot-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic"
                          capture="environment"
                          disabled={uploading}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) void upload(step.key, step.category, file)
                            event.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  )}

                  {photo && (
                    <button
                      type="button"
                      className="inspector-secondary-link"
                      // No inline min-height: an inline style outranks every
                      // stylesheet rule, so a hard-coded 38px here silently
                      // defeats the 48px ergonomics floor that
                      // `.inspector-dashboard.is-field .inspector-secondary-link`
                      // sets in field-dashboard.css. Let the stylesheet own it.
                      onClick={() => inputRefs.current[step.key]?.click()}
                    >
                      <Camera size={14} /> استبدال
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {savings && <p className="field-chip is-info" style={{ width: '100%' }}><Check size={13} />{savings}</p>}
        {error && <p role="alert" className="field-warning"><AlertTriangle size={15} />{error}</p>}
        {!complete && required && (
          <p className="field-warning">
            <AlertTriangle size={15} />
            {missingKeys.length > 0
              ? `متبقي ${missingKeys.length} صورة إلزامية: ${missingKeys.map((step) => step.label).join('، ')}.`
              : !odometerValid
                ? 'أدخل قراءة العداد الصحيحة للمتابعة.'
                : 'أكّد مطابقة لوحة المركبة للمتابعة.'}
          </p>
        )}
      </div>

      <CameraCapture
        open={cameraStep !== null}
        onClose={() => setCameraStep(null)}
        onCapture={(file) => {
          if (cameraStep) void upload(cameraStep.key, cameraStep.category, file)
        }}
        fileBaseName={cameraStep?.key ?? 'verification'}
        title={cameraStep?.label ?? 'التقاط صورة'}
        hint={cameraStep?.hint}
      />
    </section>
  )
}
