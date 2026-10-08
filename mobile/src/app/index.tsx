import { Redirect } from 'expo-router'

import { LoadingState } from '@/components/ui/states'
import { Screen } from '@/components/ui/screen'
import { useSession } from '@/lib/auth'
import { sessionGate } from '@/lib/session-gate'

/**
 * بوابة الدخول — تقرّر إلى أين يذهب المستخدم.
 *
 * ── لماذا شاشة لا `useEffect` + `router.replace` ───────────────────────────
 *
 * `<Redirect>` يعمل **أثناء الرسم**، فيُنتج انتقالًا واحدًا بلا إطار وسيط.
 * أما `router.replace` داخل `useEffect` فيرسم الشاشة الحالية أولًا ثم يستبدلها
 * — فيرى المستخدم وميضًا لشاشة فارغة، وفي أسوأ حالات الشبكة وميضًا لشاشة
 * «جارٍ التحميل» ثم قفزة.
 *
 * ── ⚠️ لا تعرض شيئًا قبل `isLoaded` ───────────────────────────────────────
 *
 * Clerk يقرأ الجلسة المحفوظة من `SecureStore` بشكل **غير متزامن**. أثناء ذلك
 * `isSignedIn` تساوي `false` ولو كان المستخدم مسجّلًا فعلًا. عرض الشاشة في
 * هذه اللحظة يعني قذف مستخدم مسجّل إلى صفحة الدخول عند كل إقلاع — وهو أكثر
 * خطأ شائع في تطبيقات Clerk على الجوال.
 * هذه الشاشة تعمل عند `/` وحده. الوصول المباشر إلى `/orders` لا يمرّ بها —
 * فحرس مجموعة التبويبات في `app/(tabs)/_layout.tsx` هو ما يسدّ ذلك. والقرار
 * نفسه في الاثنين يأتي من `sessionGate` فلا يتباعدان.
 */
export default function EntryGate() {
  const { isLoaded, isSignedIn } = useSession()
  const gate = sessionGate(isLoaded, isSignedIn)

  if (gate === 'loading') {
    return (
      <Screen>
        <LoadingState label="جارٍ التحقق من الجلسة…" />
      </Screen>
    )
  }

  if (gate === 'signed-out') return <Redirect href="/sign-in" />

  return <Redirect href="/(tabs)/orders" />
}
