'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, CheckCircle2, Info, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import {
  paymentOutcomeMessage,
  paymentOutcomeTone,
  type PaymentOutcome,
} from '@/lib/payments/payment-outcomes'

/**
 * نموذج دفع Moyasar.
 *
 * ── ما يفعل هذا المكوّن وما لا يفعله ───────────────────────────────────────
 *
 * يُنشئ الدفعة في المتصفح (هكذا يعمل نموذج Moyasar: `POST` مباشر من الصفحة
 * إلى `api.moyasar.com` بمفتاح `publishable`)، ثم يُبلّغ `/api/checkout`
 * ليتحقّق منها على الخادم. **لا يقرّر المكوّن أن الدفع نجح** — كل ما يصل من
 * المتصفح قابل للعبث، والحسم في `/api/checkout`.
 *
 * ── تفاصيل مثبَّتة من قراءة الحزمة نفسها (v2.3.0) لا من الوثائق ────────────
 *
 *   * الـAPI العام: `window.Moyasar.init(config)` (صنف ثابت).
 *   * `element` يقبل محدِّد CSS أو عنصرًا.
 *   * النموذج يُنشئ `<div id="mysr">` بنفسه — لا ننشئه.
 *   * `on_completed` و`on_failure` **يجب أن يكونا دالتين تُعيدان Promise**
 *     (`async`)، وإلا رفضهما التحقق الداخلي ورمى استثناءً.
 *   * `on_completed(payment)` يستقبل كائن الدفعة كاملًا.
 *   * `on_failure(error)` يستقبل `{ type, message, errors }` أو خطأً عاديًا.
 *   * بعد النجاح يبني النموذج بنفسه عنوان العودة:
 *       `callback_url` + `?id=<payment_id>&status=<status>&message=<...>`
 *     ويحوّل المتصفح إليه — ولا يحوّل إلا حين تكون الحالة `paid` أو `authorized`.
 *   * المفتاح العام يجب أن يطابق `/^pk_(test|live)_/`.
 *
 * ── لماذا نُبلّغ مرّتين (on_completed وصفحة العودة) ─────────────────────────
 *
 * لأن كلًّا منهما قد يفشل وحده: `on_completed` لا يعمل إن انقطع الاتصال قبل
 * التحويل، وصفحة العودة لا تعمل إن أغلق العميل التبويب لحظة التحويل. النداءان
 * يسوّيان نفس الدفعة، والتسوية idempotent — فالثاني يقرأ `already_paid`.
 */

const MOYASAR_VERSION = '2.3.0'
const MOYASAR_JS = `https://cdn.jsdelivr.net/npm/moyasar-payment-form@${MOYASAR_VERSION}/dist/moyasar.umd.min.js`
const MOYASAR_CSS = `https://cdn.jsdelivr.net/npm/moyasar-payment-form@${MOYASAR_VERSION}/dist/moyasar.css`

/** شكل الدفعة كما يمرّرها النموذج إلى `on_completed`. نقرأ منه المعرّف فقط. */
type MoyasarCallbackPayment = { id?: unknown; status?: unknown; source?: { message?: unknown } }

type CheckoutResponse = {
  ok?: boolean
  reason?: string
  error?: string
  message?: string
}

/**
 * يستخرج جملة مفهومة من خطأ النموذج.
 *
 * `on_failure` قد يستقبل `{ type, message, errors }` من الـAPI، أو كائنًا
 * أرسلته الحزمة (`{ type: 'api_error', message: 'Error code: 401' }`)، أو
 * استثناءً عاديًا. الشكل غير موثَّق، لذا نقرأه تسامحيًا بدل أن نفترض شكلًا
 * واحدًا ونعرض «خطأ غير معروف» عند أول اختلاف.
 *
 * الرسائل هنا إرشادية فقط — قرار الدفع نفسه لا يعتمد على أي منها.
 */
function readFailure(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error instanceof Error && error.message) return error.message

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>

    // رسائل التحقق لكل حقل: `errors: { number: ['...'], ... }`
    const errors = record.errors
    if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
      for (const value of Object.values(errors as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim()) return value.trim()
        if (Array.isArray(value)) {
          const first = value.find((item) => typeof item === 'string' && item.trim())
          if (typeof first === 'string') return first.trim()
        }
      }
    }

    const message = record.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }

  return 'تعذّر إتمام عملية الدفع. تحقّق من بيانات البطاقة وحاول مرة أخرى.'
}

/** يحمّل ورقة أنماط Moyasar مرة واحدة، ويُعيد وعدًا ينتهي عند جهوزها. */
function loadStylesheet(href: string): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLLinkElement>(`link[data-moyasar-css]`)
    if (existing) {
      // ورقة موجودة قد تكون قيد التحميل بعد؛ `sheet` لا تكون null إلا عند
      // اكتمال التحليل.
      if (existing.sheet) resolve()
      else existing.addEventListener('load', () => resolve(), { once: true })
      return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.moyasarCss = 'true'
    link.addEventListener('load', () => resolve(), { once: true })
    // فشل تحميل الأنماط لا يمنع الدفع: النموذج يعمل بلا تنسيق، وأسوأ من ذلك
    // إبقاء العميل أمام شاشة تحميل أبدية لأن CSS لم يصل.
    link.addEventListener('error', () => resolve(), { once: true })
    document.head.appendChild(link)
  })
}

export function MoyasarCheckout({
  inspectionId,
  amountHalalas,
  publishableKey,
  description,
  callbackUrl,
  initialPaymentId,
  initialOutcome,
}: {
  inspectionId: string
  /** أصغر وحدة للعملة (هللة) — تُحسب على الخادم، لا في المتصفح. */
  amountHalalas: number
  publishableKey: string
  description: string
  /** عنوان العودة المطلق. النموذج يضيف إليه `?id=` و`status=` و`message=`. */
  callbackUrl: string
  /** معرّف الدفعة العائد في الرابط بعد نجاح الدفع، إن وُجد. */
  initialPaymentId: string | null
  /** نتيجة محسوبة على الخادم قبل الرسم (مثل الإلغاء)، إن وُجدت. */
  initialOutcome: PaymentOutcome | null
}) {
  const router = useRouter()
  const mountRef = useRef<HTMLDivElement | null>(null)
  const startedRef = useRef(false)
  const [scriptState, setScriptState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(initialOutcome)
  const [outcomeText, setOutcomeText] = useState<string | null>(
    initialOutcome ? paymentOutcomeMessage(initialOutcome) : null,
  )
  const [failure, setFailure] = useState<string | null>(null)
  const [settling, setSettling] = useState(Boolean(initialPaymentId))

  /**
   * يُبلّغ الخادم ليؤكّد الدفعة. لا يرمي أبدًا: أسوأ حالة هي رسالة عربية واضحة،
   * لا شاشة بيضاء.
   */
  const confirmWithServer = useCallback(
    async (paymentId: string) => {
      setSettling(true)
      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspectionId, paymentId }),
        })
        const data = (await response.json().catch(() => ({}))) as CheckoutResponse

        if (response.ok && data.ok) {
          setOutcome('success')
          setOutcomeText(typeof data.message === 'string' ? data.message : paymentOutcomeMessage('success'))
          setFailure(null)
          router.refresh()
          return
        }

        // فشل مؤكَّد من الخادم: إما مبلغ غير مطابق، أو لا عرض مقبول، أو الطلب
        // ليس له. كلها أسباب نهائية تُعرض كما هي بدل رسالة عامّة.
        const message =
          typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : paymentOutcomeMessage('failed')
        setOutcome('failed')
        setOutcomeText(message)
      } catch {
        // فشل شبكي: الدفعة قد تكون ناجحة فعلًا. لا نقول «فشل الدفع» — نقول
        // «قيد المعالجة»، لأن الـWebhook سيحدّث الحالة وحدها.
        setOutcome('pending')
        setOutcomeText(paymentOutcomeMessage('pending'))
      } finally {
        setSettling(false)
      }
    },
    [inspectionId, router],
  )

  // العودة من بوابة الدفع: الرابط يحمل `?id=<payment_id>`.
  useEffect(() => {
    if (!initialPaymentId || startedRef.current) return
    startedRef.current = true
    void confirmWithServer(initialPaymentId)
  }, [initialPaymentId, confirmWithServer])

  // تحميل الحزمة ثم تركيب النموذج.
  useEffect(() => {
    // لا نركّب النموذج حين وصلنا عائدين من بوابة الدفع، ولا حين لا يوجد مفتاح
    // عام — في الحالتين لا معنى لعرض حقل بطاقة.
    if (initialPaymentId || initialOutcome || !publishableKey) return

    let cancelled = false

    async function boot() {
      await loadStylesheet(MOYASAR_CSS)

      const globalMoyasar = (window as unknown as { Moyasar?: { init?: (config: unknown) => void } }).Moyasar
      if (!globalMoyasar?.init) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>('script[data-moyasar-js]')
          const script = existing ?? document.createElement('script')

          const onLoad = () => resolve()
          const onError = () => reject(new Error('moyasar script failed to load'))

          script.addEventListener('load', onLoad, { once: true })
          script.addEventListener('error', onError, { once: true })

          if (!existing) {
            script.src = MOYASAR_JS
            script.async = true
            script.dataset.moyasarJs = 'true'
            document.head.appendChild(script)
          }
        }).catch(() => undefined)
      }

      if (cancelled) return

      const moyasar = (window as unknown as { Moyasar?: { init?: (config: unknown) => void } }).Moyasar
      if (!moyasar?.init || !mountRef.current) {
        setScriptState('error')
        return
      }

      try {
        moyasar.init({
          element: mountRef.current,
          amount: amountHalalas,
          currency: 'SAR',
          description,
          publishable_api_key: publishableKey,
          callback_url: callbackUrl,
          methods: ['creditcard'],
          // مدى أولًا لأنها الأوسع محليًا، ثم الشبكتان الدوليتان المتعارف عليهما.
          supported_networks: ['mada', 'visa', 'mastercard'],
          // يصل هذا الكائن إلى Moyasar ويعود في استجابة الدفعة؛ وهو ما يربط
          // الدفعة بطلبها حتى لو وصل إشعار بلا أي سياق آخر.
          metadata: { inspection_id: inspectionId },
          language: 'ar',
          // إلزامي أن تكون الدالتان async — الحزمة ترفض غير ذلك.
          on_completed: async (payment: MoyasarCallbackPayment) => {
            const paymentId = typeof payment?.id === 'string' ? payment.id : null
            // النموذج سيحوّل المتصفح بنفسه بعد ~100ms؛ التأكيد هنا يوفّر
            // الرحلة إن أُلغيت إعادة التوجيه لأي سبب.
            if (paymentId) await confirmWithServer(paymentId)
          },
          on_failure: async (error: unknown) => {
            setFailure(readFailure(error))
          },
        })
        setScriptState('ready')
      } catch (error) {
        console.error('[payments] Moyasar.init failed', error)
        setScriptState('error')
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [
    amountHalalas,
    callbackUrl,
    confirmWithServer,
    description,
    initialOutcome,
    initialPaymentId,
    inspectionId,
    publishableKey,
  ])

  // ── حالة العودة من البوابة ────────────────────────────────────────────────
  if (initialPaymentId || initialOutcome) {
    const tone = outcome ? paymentOutcomeTone(outcome) : 'info'
    return (
      <div className={`pay-outcome is-${tone}`} role="status" aria-live="polite">
        <span className="pay-outcome-icon" aria-hidden="true">
          {settling ? (
            <LoaderCircle size={22} className="animate-spin" />
          ) : tone === 'success' ? (
            <CheckCircle2 size={22} />
          ) : tone === 'error' ? (
            <AlertTriangle size={22} />
          ) : (
            <Info size={22} />
          )}
        </span>
        <div>
          <strong>
            {settling
              ? 'جارٍ تأكيد الدفعة'
              : tone === 'success'
                ? 'تم الدفع'
                : tone === 'error'
                  ? 'لم يكتمل الدفع'
                  : 'الدفعة قيد المعالجة'}
          </strong>
          <p>{outcomeText ?? paymentOutcomeMessage('pending')}</p>
        </div>
        <div className="pay-outcome-actions">
          <Link href="/dashboard/requests" className="btn btn-primary btn-sm">
            <ArrowRight size={15} /> طلباتي
          </Link>
        </div>
      </div>
    )
  }

  if (!publishableKey) {
    return (
      <div className="pay-outcome is-error" role="alert">
        <span className="pay-outcome-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
        <div>
          <strong>الدفع غير مُهيّأ على هذا النشر</strong>
          <p>
            لم يُضبط المفتاح العام لبوابة الدفع (NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY)، فلا يمكن
            عرض نموذج الدفع. تواصل مع الدعم لإتمام الدفع.
          </p>
        </div>
      </div>
    )
  }

  // ── نموذج الدفع ───────────────────────────────────────────────────────────
  return (
    <div className="pay-form">
      {scriptState === 'error' && (
        <div className="pay-outcome is-error" role="alert">
          <span className="pay-outcome-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
          <div>
            <strong>تعذّر تحميل نموذج الدفع</strong>
            <p>
              تحقّق من اتصالك بالإنترنت ثم أعد المحاولة. إن تكرّر الأمر فقد يكون مانع
              إعلانات يحجب نموذج الدفع.
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
              <RefreshCw size={15} /> إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {scriptState === 'loading' && (
        <p className="pay-loading">
          <LoaderCircle size={16} className="animate-spin" /> جارٍ تجهيز نموذج الدفع الآمن…
        </p>
      )}

      {/* النموذج يُركَّب هنا، وينشئ بنفسه `div#mysr` داخله. */}
      <div ref={mountRef} className="pay-form-mount" />

      {failure && (
        <div className="pay-outcome is-error" role="alert">
          <span className="pay-outcome-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
          <div>
            <strong>لم تكتمل عملية الدفع</strong>
            <p>{failure}</p>
          </div>
        </div>
      )}

      <p className="pay-secure">
        <ShieldCheck size={15} /> بيانات البطاقة تُدخل في نموذج Moyasar المعتمد ولا تمرّ عبر
        خوادمنا، ولا نحتفظ بأي جزء من رقمها.
      </p>
    </div>
  )
}
