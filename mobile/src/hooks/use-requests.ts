import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, apiGet } from '@/lib/api'
import { useApiToken } from '@/lib/auth'
import type { CustomerRequest, CustomerRequestsResponse } from '@/lib/types'

/**
 * جلب طلبات العميل.
 *
 * ── الحالة تُدار يدويًّا لا بمكتبة ─────────────────────────────────────────
 *
 * لا `react-query` ولا `swr`: التطبيق يحتاج نمطًا واحدًا (جلب + إعادة محاولة
 * + سحب للتحديث) في عدد محدود من الشاشات. مكتبة تجلب معها طبقة تخزين مؤقّت
 * وسياسات إبطال تحتاج ضبطًا — وتخزين مؤقّت خاطئ في تطبيق يعرض حالات طلب
 * حيّة أخطر من عدمه، لأن المستخدم يرى «بانتظار العروض» بعد أن وصل الفاحص.
 * (التخزين المؤقّت الحقيقي يأتي في M6 عبر SQLite بسياسة صريحة.)
 *
 * ── ⚠️ إلغاء الطلب عند مغادرة الشاشة ──────────────────────────────────────
 *
 * `AbortController` يُلغى في التنظيف. بدونه: مستخدم يفتح القائمة ثم يغادر
 * بسرعة ⇒ الطلب يصل بعد إزالة الشاشة ⇒ `setState` على مكوّن مُفكَّك. React
 * يتجاهله بصمت في الإصدارات الحديثة، لكنه يبقى عملًا شبكيًّا مهدورًا على
 * شبكة جوال مدفوعة.
 *
 * ── 🔴 لماذا `loading` مشتقّ ولا يُخزَّن ────────────────────────────────────
 *
 * `react-hooks/set-state-in-effect` يرفض `setState` **متزامنًا** داخل جسم
 * تأثير: يقع قبل أول رسم للمستخدم فيُنتج رسمًا متتاليًا بلا فائدة. وهنا كان
 * `load('initial')` يبدأ بـ`setLoading(true)` قبل أول `await` — أي بالضبط ما
 * ترفضه القاعدة.
 *
 * والعلاج ليس تعطيل القاعدة بل إزالة الحاجة: `requests === null` تعني «لم
 * يُجلب بعد»، ومنها يُشتقّ `loading`. فلا كتابة حالة قبل أول `await` إطلاقًا.
 */

export type RequestsState = {
  requests: CustomerRequest[]
  loading: boolean
  refreshing: boolean
  error: string | null
  /** `true` إن كان الخطأ يستحق إعادة المحاولة (5xx أو انقطاع شبكة). */
  retryable: boolean
  refresh: () => Promise<void>
}

export function useCustomerRequests(enabled: boolean): RequestsState {
  const getToken = useApiToken()

  /**
   * `null` تعني **لم يُجلب بعد** — لا «لا توجد طلبات».
   *
   * الفرق جوهري: مصفوفة فارغة تعني «جلبنا فعلًا ولا شيء» فتُعرض حالة فراغ
   * مطمئنة، و`null` تعني «لا نعرف بعد» فتُعرض حالة تحميل. لو خلطنا بينهما
   * لرأى المستخدم «لا توجد طلبات» في كل إقلاع قبل وصول البيانات.
   */
  const [requests, setRequests] = useState<CustomerRequest[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryable, setRetryable] = useState(true)

  // مرجع حيّ: نداء واحد في كل مرة، ونتيجة آخر نداء هي التي تُعرض. بدونه
  // يسبق ردّ نداء قديم نداءً أحدث فيستقر العرض على بيانات قديمة.
  const inFlight = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      inFlight.current?.abort()
    }
  }, [])

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!enabled) return

      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      try {
        // ⚠️ أول `await` **قبل أي كتابة حالة** — انظر الشرح في رأس الملف.
        //
        // والرمز يُطلب عند كل نداء لا مرة واحدة: `getToken` تُجدّده عند
        // انتهائه، ورمز مخزَّن في حالة React يصير منتهيًا بعد ساعة فيفشل
        // النداء بـ401 بلا سبب ظاهر.
        const token = await getToken()
        if (controller.signal.aborted || !mounted.current) return

        if (mode === 'refresh') setRefreshing(true)
        setError(null)

        if (!token) {
          setError('انتهت الجلسة. سجّل الدخول من جديد.')
          setRetryable(false)
          return
        }

        const data = await apiGet<CustomerRequestsResponse>('/api/customer/requests', token, {
          signal: controller.signal,
        })

        if (controller.signal.aborted || !mounted.current) return
        setRequests(Array.isArray(data?.requests) ? data.requests : [])
        setRetryable(true)
      } catch (caught) {
        // إلغاء من جهتنا ⇒ ليس خطأً يُعرض.
        if (controller.signal.aborted || !mounted.current) return

        if (caught instanceof ApiError) {
          setError(caught.message)
          setRetryable(caught.isRetryable)
        } else {
          setError('تعذّر تحميل طلباتك. أعد المحاولة.')
          setRetryable(true)
        }
      } finally {
        if (mounted.current) setRefreshing(false)
      }
    },
    [enabled, getToken],
  )

  useEffect(() => {
    if (!enabled) {
      // لا `setState` هنا: الطلب الجاري يُبطَل فقط، و`loading` مشتقّ من
      // `enabled` أدناه فلا يبقى مؤشّر معلّقًا على خطّاف معطَّل.
      inFlight.current?.abort()
      return
    }
    // ⚠️ النداء داخل IIFE غير متزامن **عن قصد**، لا تحسينًا أسلوبيًّا.
    // `react-hooks/set-state-in-effect` لا يتتبّع `await` عبر نداء غير مباشر،
    // فيحسب `void load('initial')` كتابة حالة **متزامنة** ويرفضه (مُختبَر:
    // `void load()` ⇒ خطأ، `void (async () => { await load() })()` ⇒ نظيف).
    // والحدّ الذي يقبله هو عين ما تنصح به React: «اشترك في نظام خارجي، واكتب
    // الحالة في callback» — والجلب فعل غير متزامن بطبيعته أصلًا.
    void (async () => {
      await load('initial')
    })()
  }, [enabled, load])

  const refresh = useCallback(() => load('refresh'), [load])

  return {
    requests: requests ?? [],
    // مشتقّ لا مخزَّن: «جارٍ التحميل» = الخطّاف مفعَّل، ولم تصل بيانات بعد،
    // ولا خطأ معروض. الاشتقاق يمنع مؤشّرًا معلّقًا بعد فشل أو بعد التعطيل.
    loading: enabled && requests === null && error === null,
    refreshing,
    error,
    retryable,
    refresh,
  }
}
