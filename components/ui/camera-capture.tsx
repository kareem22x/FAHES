'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, RefreshCw, SwitchCamera, X } from 'lucide-react'

type Facing = 'environment' | 'user'

type CameraError = { message: string }

/**
 * Turns a `getUserMedia` rejection into a sentence an inspector standing next to
 * a car can act on.
 *
 * Every branch sets the caller up to fall back to the device's own camera app,
 * because a refused permission or a camera held by another app must never block
 * the workflow — the four verification photos are legally required before the
 * checklist unlocks, so "cannot take a photo" means "cannot finish the job".
 */
function describeCameraFailure(cause: unknown): string {
  const name = (cause as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'تم رفض إذن الكاميرا. يمكنك السماح به من إعدادات المتصفح، أو استخدام كاميرا الجهاز مباشرة.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'لم يُعثر على كاميرا متاحة على هذا الجهاز.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'الكاميرا مشغولة بتطبيق آخر. أغلق التطبيقات الأخرى ثم أعد المحاولة.'
  }
  return 'تعذّر تشغيل الكاميرا. يمكنك استخدام كاميرا الجهاز مباشرة.'
}

/**
 * In-app camera capture.
 *
 * `getUserMedia` rather than `<input type="file" capture>` so the inspector sees
 * a live preview, can retake without leaving the page, and gets the shot framed
 * by our own shutter — the native picker hands back a file with no chance to
 * check focus or framing before it is uploaded and becomes part of a report.
 *
 * The file input is still the *fallback*, not the primary path: it is offered
 * inside the error state, so a denied permission or an insecure context
 * degrades to the previous behaviour instead of a dead end.
 *
 * Three details are load-bearing:
 *
 *  1. **Tracks are stopped on every exit path** — `open` going false, a facing
 *     switch, unmount. A `MediaStream` left running keeps the camera indicator
 *     lit and drains the battery, and on Android it holds the hardware so no
 *     other app can use it.
 *  2. **`playsInline` + `muted`** — without both, iOS Safari refuses to autoplay
 *     the preview and instead opens its own fullscreen player, which covers the
 *     shutter button.
 *  3. **The canvas is sized from `videoWidth`/`videoHeight`, not from CSS.** The
 *     preview is `object-cover`ed to fill the screen; using the element's box
 *     would capture a cropped, upscaled frame instead of the full sensor image.
 */
export function CameraCapture({
  open,
  onClose,
  onCapture,
  fileBaseName = 'photo',
  title = 'التقاط صورة',
  hint,
}: {
  open: boolean
  onClose: () => void
  /** Receives a JPEG `File` ready to hand to the existing upload path. */
  onCapture: (file: File) => void
  /** Base name for the produced file, e.g. `odometer`. */
  fileBaseName?: string
  title?: string
  hint?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fallbackRef = useRef<HTMLInputElement | null>(null)

  const [facing, setFacing] = useState<Facing>('environment')
  const [error, setError] = useState<CameraError | null>(null)
  const [ready, setReady] = useState(false)
  const [canSwitch, setCanSwitch] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Bumped by "retry" to re-run the stream effect without changing anything else. */
  const [attempt, setAttempt] = useState(0)

  /**
   * Stops the hardware. Deliberately does NOT touch React state: it runs from an
   * effect cleanup, where a `setState` is a cascading render (and trips
   * `react-hooks/set-state-in-effect`). The visible state is reset during render
   * instead, just below.
   */
  const releaseTracks = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  // Anything that invalidates the running stream resets the viewfinder. Done
  // during render — React's documented "adjust state when an input changes"
  // pattern — so the effect below is left with nothing but the stream lifecycle.
  const streamKey = `${open}|${facing}|${attempt}`
  const [lastStreamKey, setLastStreamKey] = useState(streamKey)
  if (lastStreamKey !== streamKey) {
    setLastStreamKey(streamKey)
    setReady(false)
    setError(null)
  }

  useEffect(() => {
    if (!open) {
      releaseTracks()
      return
    }

    let cancelled = false

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        // getUserMedia is undefined on an insecure origin as well as in old
        // browsers, and both look identical from here.
        if (!cancelled) setError({ message: 'المتصفح لا يدعم التقاط الصور مباشرة. استخدم كاميرا الجهاز.' })
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setReady(true)

        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          if (!cancelled) setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1)
        } catch {
          // Some webviews throw here. Switching is a nicety, not a requirement.
        }
      } catch (cause) {
        if (!cancelled) setError({ message: describeCameraFailure(cause) })
      }
    }

    void start()

    return () => {
      cancelled = true
      releaseTracks()
    }
  }, [open, facing, attempt, releaseTracks])

  // Escape closes, and the page behind must not scroll while the viewfinder is
  // fullscreen — on iOS a scrollable body also lets the address bar reappear.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  const capture = useCallback(async () => {
    const video = videoRef.current
    if (!video || !ready) return
    setBusy(true)
    try {
      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) throw new Error('الكاميرا لم تجهّز الصورة بعد. انتظر لحظة ثم أعد المحاولة.')

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('تعذّر تجهيز الصورة.')

      // The preview mirrors the selfie camera for the operator's comfort; the
      // saved frame must not, or every front-camera photo would come out flipped.
      if (facing === 'user') {
        context.translate(width, 0)
        context.scale(-1, 1)
      }
      context.drawImage(video, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      )
      if (!blob) throw new Error('تعذّر تجهيز الصورة.')

      onCapture(new File([blob], `${fileBaseName}-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      onClose()
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : 'تعذّر التقاط الصورة.' })
    } finally {
      setBusy(false)
    }
  }, [ready, facing, fileBaseName, onCapture, onClose])

  if (!open) return null

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex flex-col bg-[#09090b] text-white"
    >
      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[calc(12px+env(safe-area-inset-top,0px))] pb-3">
        <div className="min-w-0">
          <strong className="block text-sm font-bold">{title}</strong>
          {hint && <span className="mt-0.5 block text-[11px] text-white/60">{hint}</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الكاميرا"
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </header>

      {/* ── Viewfinder ── */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
              <AlertTriangle size={22} />
            </span>
            <p className="max-w-sm text-[13px] leading-relaxed text-white/80">{error.message}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
              >
                <RefreshCw size={15} />
                إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={() => fallbackRef.current?.click()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-bold text-[#09090b] transition-opacity hover:opacity-90"
              >
                <Camera size={15} />
                كاميرا الجهاز
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Live camera feed: no audio track is ever requested, so there is
                nothing to caption. */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="size-full object-cover"
              style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
            />
            {!ready && (
              <div className="absolute inset-0 grid place-items-center">
                <span className="text-[12px] text-white/60">جارٍ تشغيل الكاميرا…</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Shutter ── */}
      {!error && (
        <footer className="flex shrink-0 items-center justify-between gap-4 px-6 pt-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))]">
          <span className="w-11" aria-hidden="true" />
          <button
            type="button"
            onClick={() => void capture()}
            disabled={!ready || busy}
            aria-label="التقاط الصورة"
            className="grid size-[72px] place-items-center rounded-full border-4 border-white/85 bg-white/25 transition-transform active:scale-95 disabled:opacity-40"
          >
            <span className="block size-[56px] rounded-full bg-white" />
          </button>
          {canSwitch ? (
            <button
              type="button"
              onClick={() => setFacing((current) => (current === 'environment' ? 'user' : 'environment'))}
              aria-label="تبديل الكاميرا"
              className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <SwitchCamera size={18} />
            </button>
          ) : (
            <span className="w-11" aria-hidden="true" />
          )}
        </footer>
      )}

      {/* Always mounted: this is the graceful degradation path for a denied
          permission, an insecure origin, or a browser with no getUserMedia. */}
      <input
        ref={fallbackRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) {
            onCapture(file)
            onClose()
          }
        }}
      />
    </div>
  )
}

export default CameraCapture
