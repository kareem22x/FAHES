import 'server-only'

/**
 * عميل Moyasar REST — المصادقة بالمفتاح السرّي.
 *
 * سبب وجوده: كل ما يقرّره التطبيق عن الدفع يجب أن يُقرأ من Moyasar مباشرةً،
 * لا من جسم الـWebhook ولا من المتصفح. إعدادات نموذج الدفع تُبنى في المتصفح،
 * فأي شيء يصل من هناك (المبلغ، معرّف الدفعة، الحالة) قابل للعبث. الجسم الذي
 * نثق به هو ردّ `GET /v1/payments/:id` المصادَق بالمفتاح السرّي.
 *
 * المصادقة HTTP Basic باسم المستخدم = المفتاح السرّي وكلمة مرور فارغة، كما
 * توثّقه Moyasar. المفتاح لا يُسجَّل ولا يظهر في أي رسالة خطأ.
 *
 * ⚠️ هذا الملف يستخدم `Buffer`، فهو يعمل على وقت تشغيل Node فقط. لا يوجد
 * `export const runtime` في أي مسار بالمشروع، فالافتراضي Node — وهو نفسه
 * النمط المستخدم في `lib/sms/index.ts`. لو حُوِّل مسار إلى Edge لاحقًا فسيفشل
 * بناء الترويسة أعلاه، لا الاستعلام.
 */

const MOYASAR_API_BASE = 'https://api.moyasar.com/v1'

/** مهلة الجلب. بدونها يعلّق مسار الـWebhook حتى مهلة Vercel ويسقط الردّ. */
const REQUEST_TIMEOUT_MS = 10_000

export class MoyasarConfigurationError extends Error {
  constructor() {
    super('Moyasar secret key is not configured')
    this.name = 'MoyasarConfigurationError'
  }
}

export class MoyasarRequestError extends Error {
  readonly status: number
  constructor(status: number, detail: string) {
    super(`Moyasar request failed with HTTP ${status}: ${detail.slice(0, 200)}`)
    this.name = 'MoyasarRequestError'
    this.status = status
  }
}

/** شكل الدفعة كما تعيده Moyasar. الحقول غير المستخدمة محذوفة عن قصد. */
export type MoyasarPayment = {
  id: string
  status: string
  /** أصغر وحدة للعملة (هللة)، لا ريال. */
  amount: number
  currency: string
  description: string | null
  refunded: number | null
  captured: number | null
  callback_url: string | null
  created_at: string | null
  updated_at: string | null
  metadata: Record<string, unknown> | null
  source: Record<string, unknown> | null
}

export function moyasarConfigured(): boolean {
  return Boolean(process.env.MOYASAR_SECRET_KEY?.trim())
}

function secretKey(): string {
  const key = process.env.MOYASAR_SECRET_KEY?.trim()
  if (!key) throw new MoyasarConfigurationError()
  return key
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toPayment(raw: unknown): MoyasarPayment {
  const record = asRecord(raw)
  if (!record) throw new MoyasarRequestError(502, 'payment payload is not an object')

  const id = asString(record.id)
  const status = asString(record.status)
  const amount = asNumber(record.amount)
  const currency = asString(record.currency)

  // حقول لا معنى للدفعة بدونها. غيابها يعني أن الشكل تغيّر، ولا يجوز أن
  // نمضي بالتخمين إلى تسوية مالية.
  if (!id || !status || amount === null || !currency) {
    throw new MoyasarRequestError(502, 'payment payload is missing id, status, amount or currency')
  }

  return {
    id,
    status,
    amount,
    currency,
    description: asString(record.description),
    refunded: asNumber(record.refunded),
    captured: asNumber(record.captured),
    callback_url: asString(record.callback_url),
    created_at: asString(record.created_at),
    updated_at: asString(record.updated_at),
    metadata: asRecord(record.metadata),
    source: asRecord(record.source),
  }
}

/**
 * يجلب دفعة واحدة بمعرّفها.
 *
 * يرمي `MoyasarRequestError` عند أي فشل — بما فيه 404. لا يسقط إلى `null`،
 * لأن المستدعي يجب أن يفرّق بين «الدفعة غير موجودة» و«تعذّر الاتصال»: الأول
 * خطأ دائم لا يفيد معه إعادة المحاولة، والثاني مؤقت ويستحق ردًّا غير 2xx كي
 * يعيد Moyasar الإرسال.
 */
export async function fetchPayment(paymentId: string): Promise<MoyasarPayment> {
  const id = paymentId.trim()
  if (!id) throw new MoyasarRequestError(400, 'empty payment id')

  const authorization = `Basic ${Buffer.from(`${secretKey()}:`).toString('base64')}`

  let response: Response
  try {
    response = await fetch(`${MOYASAR_API_BASE}/payments/${encodeURIComponent(id)}`, {
      headers: { Authorization: authorization, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown transport error'
    throw new MoyasarRequestError(502, detail)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new MoyasarRequestError(response.status, detail || response.statusText)
  }

  return toPayment(await response.json().catch(() => null))
}

/**
 * معرّف الطلب الذي تحمله الدفعة في `metadata`.
 *
 * نكتبه عند إنشاء الدفعة من صفحة الدفع، فيبقى للدفعة مسار إلى طلبها حتى لو
 * وصل إشعار بلا أي سياق آخر.
 */
export function inspectionIdFromMetadata(payment: MoyasarPayment): string | null {
  const metadata = payment.metadata
  if (!metadata) return null
  const direct = asString(metadata.inspection_id) ?? asString(metadata.inspectionId)
  if (!direct) return null
  const trimmed = direct.trim()
  return trimmed === '' ? null : trimmed
}
