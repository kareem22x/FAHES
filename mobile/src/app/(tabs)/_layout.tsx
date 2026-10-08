import { Redirect } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import { Bell, ClipboardList, MapPin, User } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Screen } from '@/components/ui/screen'
import { LoadingState } from '@/components/ui/states'
import { useSession } from '@/lib/auth'
import { haptic } from '@/lib/haptics'
import { sessionGate } from '@/lib/session-gate'
import { TAB_BAR_CONTENT_HEIGHT, useTheme } from '@/theme'

/**
 * شريط التبويبات — أربعة أزرار، وهي كل تنقّل التطبيق الأساسي.
 *
 * ── لماذا `expo-router/js-tabs` لا `expo-router` ──────────────────────────
 *
 * لأن التصدير من جذر الحزمة **مُهجور** بنصّ صريح في `exports.d.ts`:
 *
 *     @deprecated Use `import { Tabs } from 'expo-router/js-tabs'` instead.
 *     export { Tabs } from './layouts/Tabs';
 *
 * وهو نفس المكوّن حرفيًّا (`js-tabs.js` = `require('./build/layouts/Tabs')`)،
 * فالتغيير يمحو تحذير إهلاك بلا أي فرق في السلوك — ولو بقي لكان أول ما
 * يُصلَح عند الترقية القادمة مع احتمال نسيانه.
 *
 * ── 🩸 لماذا هذا الملف يحرس المجموعة كلها ─────────────────────────────────
 *
 * لم يكن يحرس شيئًا. الشاشات تفترض وجود جلسة، وبوابة الدخول كانت في
 * `app/index.tsx` عند مسار الجذر `/` وحده. فأي وصول مباشر إلى `/orders`
 * (رابط، أو `router.replace`، أو إعادة تحميل في الويب) يتخطّى البوابة:
 * `useCustomerRequests(true)` بلا جلسة ⇒ `getToken()` تُرجع `null` ⇒ خطأ
 * «انتهت الجلسة» **غير قابل لإعادة المحاولة** ⇒ `ErrorState` بلا زرّ ⇒ شاشة
 * مسدودة لا بيانات فيها ولا طريق إلى الدخول.
 *
 * والحرس هنا لا في كل شاشة: قاعدة واحدة تُسأل مرّة واحدة.
 *
 * ⚠️ **الترتيب مهم**: `sessionGate` تفحص `isLoaded` أولًا. لو فحصنا
 * `isSignedIn` قبله لقذفنا مستخدمًا مسجَّلًا إلى الدخول عند كل إقلاع، لأن
 * Clerk يقرأ الجلسة المحفوظة بشكل غير متزامن.
 *
 * ── ولماذا `<Redirect>` لا `router.replace` في تأثير ──────────────────────
 *
 * `<Redirect>` يعمل **أثناء الرسم** فيُنتج انتقالًا واحدًا بلا إطار وسيط. أما
 * `router.replace` داخل `useEffect` فيرسم الشاشة الحالية أولًا ثم يستبدلها —
 * فيرى المستخدم وميضًا لشاشة فارغة ثم قفزة.
 *
 * ── ولماذا صار `/` هو التبويب الأوّل ──────────────────────────────────────
 *
 * كان `app/index.tsx` بوابةً عند `/`، ولإضافة شاشة رئيسية للتطبيق كان لا بدّ
 * من مسارين يتنازعان `/`. فحُذفت البوابة: `/` صار شاشة `(tabs)/index`،
 * والحرس — الذي كان فيها — موجود هنا أصلًا. فالمستخدم المسجَّل يرى الخريطة
 * مباشرةً بلا خطوة تحويل، وغير المسجَّل يُحوَّل من هنا.
 *
 * ── اللمسات ───────────────────────────────────────────────────────────────
 *
 * `listeners.tabPress` لا `tabBarButton`: الأخير يفرض إعادة كتابة منطق
 * الضغط كاملًا (الحالة النشطة، القفز، الوصولية) وهو موضع تُكسر فيه الشريط.
 * أما `listeners` فيُضيف إحساسًا إلى ضغطة الملّاح نفسها — لا بديل عنها.
 */

/**
 * ارتفاع محتوى الشريط بلا الهوامش الآمنة، وارتفاع سطر التسمية.
 *
 * ── 🩸 الأعطال مُقاسة لا مُقدَّرة ──────────────────────────────────────────
 *
 * كان الشريط بارتفاع 60 وحشوة 6/6، فيبقى لعنصر التبويب 47px، منها **5px
 * حشوة أعلى و5px أسفل** (حشوة يفرضها عنصر التبويب نفسه — قياس، لا وثائق)
 * ⇒ **37px متاحة**. والمحتوى يحتاج **45px**: أيقونة 28 (مقيسة) + تسمية 17.
 *
 * ولأن التسمية عنصر مرن بـ`flex-shrink: 1` افتراضيًّا، لم تتجاوز الحاوية ولم
 * تُقصّ من أسفلها — بل **انضغطت** إلى **9px**. النتيجة: «طلباتي» و«حسابي»
 * مقطوعتان من أسفلها، بلا أي خطأ ولا تحذير، و`tsc` و`eslint` و`build` ناجحة.
 *
 * ── الحساب ────────────────────────────────────────────────────────────────
 *
 *   ارتفاع عنصر التبويب = TAB_BAR_CONTENT_HEIGHT − حشوة الشريط − 1 (حدّ علوي)
 *   المتاح للمحتوى      = ارتفاع العنصر − 10 (حشوة العنصر 5+5)
 *   المطلوب             = 28 (أيقونة) + 2 (فاصل) + 17 (تسمية) = 47
 *
 *   70 − 5 − 5 − 1 = 59 ⇒ المتاح 49 ⇒ **فائض 2**
 *
 * ⚠️ **لا تُصغّر هذه الأرقام بلا إعادة قياس على جهاز.** الفائض 2px مقصود:
 * جهاز بإعداد تكبير خطّ يستهلكه، والانضغاط صامت.
 *
 * ⚠️ و`tabBarItemStyle` **لم تُنفَّذ** على عنصر التبويب عند تجربتها (بقيت
 * الحشوة 5px و`justifyContent` على `flex-start`)، فلا يُبنى عليها.
 */
const LABEL_LINE_HEIGHT = 17

export default function TabsLayout() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
          // الارتفاع 70 لا الافتراضي (~49): التسمية العربية تحتاج سطرًا أطول،
          // والأهم أنه يبقي هدف اللمس فوق 44 نقطة. الحساب أعلاه.
          //
          // ⚠️ `insets.bottom` يُضاف إلى الارتفاع **وإلى** الحشوة السفلية معًا،
          // فيبقى محتوى الشريط ثابتًا على كل جهاز. تثبيت `height` بلا الهامش
          // كان يُنتج شريطًا يغطّي شريط إيماءات أندرويد.
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 5,
          paddingBottom: 5 + insets.bottom,
        },
        tabBarIconStyle: { marginBottom: 2 },
        tabBarLabelStyle: {
          fontFamily: t.font.semibold,
          fontSize: t.fontSize['2xs'],
          // 🩸 بلا `lineHeight` صريح يرسم صندوق النصّ بارتفاع السطر الافتراضي
          // للخطّ (9px مع Alexandria) فتُقصّ النوازل من أسفل.
          lineHeight: LABEL_LINE_HEIGHT,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} strokeWidth={2.2} />,
        }}
        listeners={{ tabPress: () => haptic.tap() }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'طلباتي',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} strokeWidth={2.2} />,
        }}
        listeners={{ tabPress: () => haptic.tap() }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'التنبيهات',
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} strokeWidth={2.2} />,
        }}
        listeners={{ tabPress: () => haptic.tap() }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={2.2} />,
        }}
        listeners={{ tabPress: () => haptic.tap() }}
      />
    </Tabs>
  )
}
