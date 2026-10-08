import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo'
import * as SecureStore from 'expo-secure-store'
import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { env } from './env'

/**
 * المصادقة — Clerk بنفس نسخة الويب.
 *
 * ── لماذا Clerk لا مصادقة جديدة ───────────────────────────────────────────
 *
 * الهوية في هذا المنتج **رقم الجوال**، والويب يبني عليها: بوابة الجوال
 * (`phoneGateDecision`)، فهرس `phone` الفريد، وفحص المالك بالمُعرّف. لو بنى
 * التطبيق مصادقة ثانية لصار عندنا مصدرا هوية — وهو أسرع طريق إلى «الحساب
 * موجود على الويب وغير موجود في التطبيق».
 *
 * ⇒ نفس النسخة (`pk_test_cmVsaWV2ZWQtZXdlLTkxNy5jbGVyay5hY2NvdW50cy5kZXYk`)،
 * فالمستخدم نفسه ورقم الجوال نفسه والسجل نفسه.
 *
 * ── مخزن الرموز ───────────────────────────────────────────────────────────
 *
 * `expo-secure-store` وليس `AsyncStorage`: رمز الجلسة سرّ فعلي، وAsyncStorage
 * ملف نصّي عادي يمكن قراءته على جهاز مروّت. SecureStore يذهب إلى Keychain
 * على iOS وKeystore على أندرويد.
 *
 * ⚠️ SecureStore يرفض القيم الأكبر من 2048 بايت على بعض أجهزة أندرويد. رمز
 * Clerk لجلسة عادية أصغر من ذلك، لكن رمزًا منفوخًا بالـclaims قد يقترب.
 * Clerk يكتب مفتاحًا لكل رمز على حدة (لا رمز واحد ضخم)، فلا يبلغ الحدّ.
 */
const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      // مخزن تالف (استعادة نسخة، تغيير قفل الشاشة) ⇒ نُعيد null فيسجّل
      // المستخدم دخوله من جديد. أفضل من انهيار عند الإقلاع.
      return null
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch {
      // فشل الكتابة يعني جلسة لا تُحفظ — لا نُسقط التطبيق بسببها.
    }
  },
  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch {
      /* لا شيء: المفتاح غير موجود أصلًا في أغلب الحالات. */
    }
  },
}

type SessionValue = {
  /** رمز الجلسة لإرساله إلى `/api/*`، أو `null` قبل الإقلاع/التسجيل. */
  token: string | null
  isSignedIn: boolean
  /** هل انتهى Clerk من قراءة الجلسة المحفوظة؟ لا تعرض شيئًا قبلها. */
  isLoaded: boolean
  userId: string | null
  /** الاسم للعرض — من Clerk مباشرةً. */
  displayName: string | null
  phone: string | null
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

/**
 * يقرأ الجلسة من Clerk ويعرّضها بشكل موحّد.
 *
 * ⚠️ **`getToken()` لا `session.getToken()`**: الأولى تُجدّد الرمز عند
 * انتهائه، والثانية قد تُعيد رمزًا منتهيًا فتفشل النداءات بـ401 بعد ساعة.
 * نطلبها عند كل نداء API لا مرة واحدة عند الإقلاع.
 */
function SessionBridge({ children }: { children: ReactNode }) {
  // لا `getToken` هنا عن قصد: الجلسة تُقرأ للعرض، والرمز يُطلب من
  // `useApiToken()` عند كل نداء. جرّه إلى هنا كان سيُغري بتخزينه.
  const { isLoaded, isSignedIn, userId, signOut } = useAuth()
  const { user } = useUser()

  const value = useMemo<SessionValue>(() => {
    return {
      // لا نُخزّن الرمز في حالة React: نُجدّده عند كل نداء عبر `getToken`.
      // تخزينه كان سيُجمّده حتى انتهائه — وهو خطأ يظهر بعد ساعة من الاستخدام
      // لا في أول اختبار.
      token: null,
      isSignedIn: Boolean(isSignedIn),
      isLoaded,
      userId: userId ?? null,
      displayName:
        user?.fullName?.trim() ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
        null,
      phone: user?.primaryPhoneNumber?.phoneNumber ?? null,
      signOut: async () => {
        await signOut()
      },
    }
  }, [isLoaded, isSignedIn, userId, user, signOut])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/** الجلسة الحالية. يرمي إن استُخدم خارج المزوّد — خطأ برمجي لا حالة تشغيل. */
export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession يجب أن يُستخدم داخل <AppAuthProvider>.')
  return value
}

/**
 * خطّاف يجلب رمز الجلسة **مُجدَّدًا** عند الحاجة.
 *
 * هذا ما تستخدمه الشاشات فعليًّا: `const getToken = useApiToken()` ثم
 * `await getToken()` قبل كل نداء. الغلاف موجود ليمنع استدعاء `getToken` من
 * Clerk مباشرةً في 30 موضعًا، فيتغيّر مكان الجلسة في مكان واحد.
 */
export function useApiToken(): () => Promise<string | null> {
  const { getToken } = useAuth()
  return getToken
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={env.clerkPublishableKey} tokenCache={tokenCache}>
      <SessionBridge>{children}</SessionBridge>
    </ClerkProvider>
  )
}
