import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, apiGet, apiPost } from '@/lib/api'
import { useApiToken } from '@/lib/auth'
import type { AppNotification, NotificationsResponse } from '@/lib/notification-types'

/**
 * جلب الإشعارات وتحديث حالة القراءة.
 *
 * ── نفس بنية `use-requests.ts` عن قصد ─────────────────────────────────────
 *
 * الحالة اليدوية، و`null` تعني «لم يُجلب بعد»، و`loading` **مشتقّ** لا مخزَّن،
 * والنداء داخل IIFE غير متزامن — لأن `react-hooks/set-state-in-effect` يرفض
 * `setState` متزامنًا في جسم تأثير. تكرار النمط مقصود: خطّافان بنمطين مختلفين
 * يعنيان سلوكين مختلفين عند الفشل، والمستخدم يرى الفرق لا الكود.
 *
 * ── لماذا التحديث المتفائل لتحديد القراءة ─────────────────────────────────
 *
 * «تحديد الكل كمقروء» إجراء يُنتظر فيه تغيّر الشارة. لو انتظرنا الخادم لعرض
 * النتيجة لبدا الزرّ كأنه لم يعمل (زمن الجولة على شبكة جوال 300ms+). فنُحدّث
 * محليًّا فورًا، وإن فشل الخادم نُعيد الحالة السابقة — لا نترك واجهة تكذب.
 */

export type NotificationsState = {
  notifications: AppNotification[]
  unread: number
  loading: boolean
  refreshing: boolean
  error: string | null
  retryable: boolean
  refresh: () => Promise<void>
  /** يعلّم إشعارًا واحدًا كمقروء. لا يفعل شيئًا إن كان مقروءًا. */
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

export function useNotifications(enabled: boolean): NotificationsState {
  const getToken = useApiToken()

  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryable, setRetryable] = useState(true)

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
        // ⚠️ أول `await` قبل أي كتابة حالة — انظر رأس `use-requests.ts`.
        const token = await getToken()
        if (controller.signal.aborted || !mounted.current) return

        if (mode === 'refresh') setRefreshing(true)
        setError(null)

        if (!token) {
          setError('انتهت الجلسة. سجّل الدخول من جديد.')
          setRetryable(false)
          return
        }

        const data = await apiGet<NotificationsResponse>('/api/notifications', token, {
          signal: controller.signal,
        })

        if (controller.signal.aborted || !mounted.current) return
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : [])
        setUnread(typeof data?.unread === 'number' ? data.unread : 0)
        setRetryable(true)
      } catch (caught) {
        if (controller.signal.aborted || !mounted.current) return

        if (caught instanceof ApiError) {
          setError(caught.message)
          setRetryable(caught.isRetryable)
        } else {
          setError('تعذّر تحميل التنبيهات. أعد المحاولة.')
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
      inFlight.current?.abort()
      return
    }
    void (async () => {
      await load('initial')
    })()
  }, [enabled, load])

  const refresh = useCallback(() => load('refresh'), [load])

  const markRead = useCallback(
    async (id: string) => {
      const token = await getToken()
      if (!token) return

      const now = Date.now()
      const previous = { notifications, unread }

      // تحديث متفائل — انظر رأس الملفّ.
      setNotifications((current) =>
        current ? current.map((item) => (item.id === id ? { ...item, readAt: item.readAt ?? now } : item)) : current,
      )
      setUnread((value) => Math.max(0, value - 1))

      try {
        const result = await apiPost<{ unread?: number }>('/api/notifications', token, { id })
        if (!mounted.current) return
        if (typeof result?.unread === 'number') setUnread(result.unread)
      } catch {
        // فشل الخادم ⇒ نُعيد ما كان. واجهة تقول «مقروء» وقد بقي غير مقروء
        // أسوأ من عدم التحديث.
        if (!mounted.current) return
        setNotifications(previous.notifications)
        setUnread(previous.unread)
      }
    },
    [getToken, notifications, unread],
  )

  const markAllRead = useCallback(async () => {
    const token = await getToken()
    if (!token) return

    const now = Date.now()
    const previous = { notifications, unread }

    setNotifications((current) =>
      current ? current.map((item) => ({ ...item, readAt: item.readAt ?? now })) : current,
    )
    setUnread(0)

    try {
      await apiPost('/api/notifications', token)
    } catch {
      if (!mounted.current) return
      setNotifications(previous.notifications)
      setUnread(previous.unread)
    }
  }, [getToken, notifications, unread])

  return {
    notifications: notifications ?? [],
    unread,
    // مشتقّ لا مخزَّن — انظر رأس `use-requests.ts`.
    loading: enabled && notifications === null && error === null,
    refreshing,
    error,
    retryable,
    refresh,
    markRead,
    markAllRead,
  }
}
