import { env } from './env'

/**
 * عميل الـAPI — الطبقة الوحيدة التي تتكلّم مع الخادم.
 *
 * ── لماذا عبر الخادم لا Supabase مباشرةً ──────────────────────────────────
 *
 * ترحيل `20261001000010_rls_deny_by_default.sql` يسحب كل صلاحية من `anon`
 * و`authenticated` على جداول الطلبات. فالقراءة المباشرة من الجهاز **مرفوضة
 * بالتصميم**، لا لخطأ في الإعداد. الطريق الصحيح هو مسارات `/api/*` القائمة،
 * وهي تعيد استخدام منطق الخادم كاملًا: فحص الملكية، التحقق، تسوية الدفع.
 *
 * ⇒ الفائدة أن التطبيق لا يكرّر قاعدة عمل واحدة. أي إصلاح في الخادم يصل
 * للتطبيق بلا إصدار جديد في المتجر.
 *
 * ── الترميز ───────────────────────────────────────────────────────────────
 *
 * الخادم يعيد `{ error, reason }` عند الفشل، والرسالة **عربية جاهزة للعرض**
 * (اتفاق موثَّق في `MEMORY.md`: «سبب واحد لكل رسالة، يُمرَّر في `reason`»).
 * لذلك لا نُعيد صياغة رسالة الخادم ولا نترجمها — نرفعها كما هي. إعادة
 * الصياغة في العميل كانت ستُنتج نسختين تتباعدان.
 */

/** خطأ من الخادم يحمل رمز الحالة والسبب ورسالة عربية جاهزة للعرض. */
export class ApiError extends Error {
  readonly status: number
  readonly reason: string

  constructor(status: number, reason: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.reason = reason
  }

  /** هل الخطأ يعني أن الجلسة انتهت؟ (يوجب إعادة تسجيل الدخول.) */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403
  }

  /** هل الخطأ عابر ويستحق إعادة المحاولة؟ (لا مدخل خاطئ ولا صلاحية.) */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 0
  }
}

/** انتهت المهلة قبل أن يجيب الخادم. */
export class ApiTimeoutError extends ApiError {
  constructor() {
    super(0, 'timeout', 'تأخّر الخادم في الرد. تحقّق من الاتصال وأعد المحاولة.')
    this.name = 'ApiTimeoutError'
  }
}

/** تعذّر الوصول إلى الشبكة أصلًا (لا إنترنت، أو الخادم غير متاح). */
export class ApiNetworkError extends ApiError {
  constructor() {
    super(0, 'network', 'تعذّر الاتصال بالخادم. تحقّق من الإنترنت وأعد المحاولة.')
    this.name = 'ApiNetworkError'
  }
}

/**
 * المهلة الافتراضية.
 *
 * 15 ثانية: كافية لشبكة جوال بطيئة في الميدان، وقصيرة كفاية لئلا يحدّق
 * الفاحص في شاشة مجمّدة. لا نجعلها أطول — المستخدم يعيد المحاولة أسرع مما
 * ينتظر.
 */
const DEFAULT_TIMEOUT_MS = 15_000

type RequestOptions = {
  /** رمز جلسة Clerk. مطلوب دائمًا: كل مسارات هذا المنتج محميّة. */
  token: string | null
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

/** شكل جسم الخطأ القياسي في هذا المنتج. */
type ErrorBody = { error?: unknown; reason?: unknown }

function messageFromBody(body: unknown, status: number): { reason: string; message: string } {
  if (body && typeof body === 'object') {
    const { error, reason } = body as ErrorBody
    if (typeof error === 'string' && error.trim()) {
      return {
        reason: typeof reason === 'string' && reason.trim() ? reason : 'unknown',
        message: error,
      }
    }
  }
  // لا رسالة من الخادم: نُسمّي الحالة بدل عرض «خطأ 502» بلا معنى للمستخدم.
  return { reason: 'unknown', message: `تعذّر إتمام العملية (${status}). أعد المحاولة.` }
}

/**
 * نداء واحد إلى الخادم.
 *
 * يجمع مهلة النداء مع إشارة إلغاء قادمة من المكوّن (عند مغادرة الشاشة)، لأن
 * `AbortSignal.any` غير متاح في Hermes على كل الإصدارات — فيُربط يدويًّا.
 */
export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const { token, method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options

  const url = path.startsWith('http') ? path : `${env.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // إشارة المستدعي تُلغى ⇒ نُلغي نحن أيضًا. الإلغاء من الشاشة ليس خطأً يُعرض.
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    // التوقيت انتهى بفعل مؤقّتنا ⇒ مهلة. أما إلغاء المستدعي ⇒ نُمرّره صاعدًا
    // بلا تغليف، حتى لا يُعرض للمستخدم «تعذّر الاتصال» وهو غادر الشاشة.
    if (signal?.aborted) throw error
    if (controller.signal.aborted) throw new ApiTimeoutError()
    throw new ApiNetworkError()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onExternalAbort)
  }

  // 204 بلا جسم: لا تحاول تحليله.
  if (response.status === 204) return undefined as T

  const raw = await response.text()
  let parsed: unknown = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      // جسم ليس JSON — يحدث مع صفحة خطأ من وسيط أو من Vercel. لا نُسقط
      // التطبيق على `JSON.parse`؛ نُعامله كخطأ خادم برسالة عامة.
      if (response.ok) {
        throw new ApiError(response.status, 'invalid_body', 'ردّ غير متوقّع من الخادم. أعد المحاولة.')
      }
      parsed = null
    }
  }

  if (!response.ok) {
    const { reason, message } = messageFromBody(parsed, response.status)
    throw new ApiError(response.status, reason, message)
  }

  return parsed as T
}

/** نداء GET مختصر. */
export function apiGet<T>(path: string, token: string | null, options?: Omit<RequestOptions, 'token' | 'method'>) {
  return apiRequest<T>(path, { ...options, token, method: 'GET' })
}

/** نداء POST مختصر. */
export function apiPost<T>(path: string, token: string | null, body?: unknown, options?: Omit<RequestOptions, 'token' | 'method' | 'body'>) {
  return apiRequest<T>(path, { ...options, token, method: 'POST', body })
}
