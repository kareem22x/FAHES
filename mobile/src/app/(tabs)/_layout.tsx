import { Redirect, Tabs } from 'expo-router'
import { ClipboardList, User } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Screen } from '@/components/ui/screen'
import { LoadingState } from '@/components/ui/states'
import { useSession } from '@/lib/auth'
import { sessionGate } from '@/lib/session-gate'
import { useTheme } from '@/theme'

/**
 * شريط التبويبات — واجهة العميل.
 *
 * ── 🩸 لماذا هذا الملف يحرس المجموعة كلها ─────────────────────────────────
 *
 * لم يكن يحرس شيئًا. الشاشتان (`orders` و`account`) تفترضان وجود جلسة،
 * وبوابة الدخول في `app/index.tsx` تعمل عند مسار الجذر `/` وحده. فأي وصول
 * مباشر إلى `/orders` (رابط، أو `router.replace`، أو إعادة تحميل في الويب
 * حيث يبقى المسار كما هو) يتخطّى البوابة تمامًا:
 *
 *   `useCustomerRequests(true)` ⇒ بلا جلسة ⇒ `getToken()` تُرجع `null`
 *   ⇒ الخطّاف يضع خطأ «انتهت الجلسة. سجّل الدخول من جديد.»
 *   ⇒ `ErrorState` **بلا زرّ** (فالخطأ غير قابل لإعادة المحاولة)
 *   ⇒ شاشة مسدودة: لا بيانات، ولا طريقة للوصول إلى الدخول.
 *
 * والحرس هنا لا في كل شاشة: قاعدة واحدة تُسأل مرّة واحدة. نسخها في
 * `orders` و`account` تُنتج نسختين تتباعدان عند أول تبويب جديد.
 *
 * ⚠️ **الترتيب مهم**: `sessionGate` تفحص `isLoaded` أولًا. لو فحصنا
 * `isSignedIn` قبله لقذفنا مستخدمًا مسجَّلًا إلى الدخول عند كل إقلاع، لأن
 * Clerk يقرأ الجلسة المحفوظة بشكل غير متزامن.
 *
 * ── لماذا `Redirect` لا `Tabs.Protected` ──────────────────────────────────
 *
 * `Tabs.Protected` موجود فعلًا في expo-router 57، لكن دلالة ما يحدث عند
 * إزالة المسار **الحالي** من الملّاحة تعتمد على سلوك الاحتياط الداخلي.
 * أما `Redirect` فصريحة: المسار في الرابط يصير `/sign-in` فعلًا. ومع
 * مجموعتين فقط الفرق صغير، ومع M3 (مجموعة الفاحص) يصير الفرق واضحًا.
 *
 * ── لماذا تبويبان لا أكثر ─────────────────────────────────────────────────
 *
 * القاعدة التي بنى عليها أوبر واجهته: التبويب لما يُفتح كل يوم، والباقي داخل
 * شاشة أو ورقة. العميل يفتح التطبيق لأمرين: يتابع طلبه، أو يعدّل حسابه.
 * «طلب جديد» إجراء لا قسم — مكانه زرّ عائم في قائمة الطلبات، لا تبويب رابع
 * يزاحم.
 *
 * ── واجهة الفاحص ──────────────────────────────────────────────────────────
 *
 * ستكون مجموعة تبويبات **منفصلة** لا تبويبًا ثالثًا هنا: الفاحص لا يرى طلباته
 * كعميل ولا حسابه كعميل، ولا يجوز أن يرى الاثنين. الفصل في التوجيه (M3) لا
 * في الشريط.
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
 * مقطوعتان من أسفلهما، بلا أي خطأ ولا تحذير، و`tsc` و`eslint` ناجحان.
 *
 * ── الحساب ────────────────────────────────────────────────────────────────
 *
 *   ارتفاع عنصر التبويب = BAR_CONTENT_HEIGHT − حشوة الشريط − 1 (حدّ علوي)
 *   المتاح للمحتوى      = ارتفاع العنصر − 10 (حشوة العنصر 5+5)
 *   المطلوب             = 28 (أيقونة) + 2 (فاصل) + 17 (تسمية) = 47
 *
 *   BAR_CONTENT_HEIGHT = 70 ، حشوة 5/5 ⇒ العنصر 59 ⇒ المتاح 49 ⇒ **فائض 2**
 *
 * ⚠️ **لا تُصغّر هذه الأرقام بلا إعادة قياس.** الفائض 2px مقصود: جهاز
 * بإعداد تكبير خطّ يستهلكه، والانضغاط صامت — لا يظهر في أي فحص ساكن.
 *
 * ⚠️ و`tabBarItemStyle` **لم تُنفَّذ** على عنصر التبويب عند تجربتها (بقيت
 * الحشوة 5px و`justifyContent` على `flex-start`)، فلا يُبنى عليها. ولذلك
 * يُحسب الفائض ضمن الطول بدل الاعتماد على إلغاء الحشوة.
 */
const BAR_CONTENT_HEIGHT = 70
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
          // الارتفاع 70 لا الافتراضي (~49): الشريط يحمل نصًّا عربيًّا تحت
          // الأيقونة، والعربية تحتاج سطرًا أطول. والأهم أنه يبقي هدف اللمس
          // فوق 44 نقطة. الحساب الكامل في `BAR_CONTENT_HEIGHT` أعلاه.
          //
          // ⚠️ `insets.bottom` يُضاف إلى الارتفاع **وإلى** الحشوة السفلية معًا،
          // فيبقى محتوى الشريط ثابتًا على كل جهاز. تثبيت `height` بلا الهامش
          // كان يُنتج شريطًا يغطّي شريط إيماءات أندرويد.
          height: BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 5,
          paddingBottom: 5 + insets.bottom,
        },
        tabBarIconStyle: { marginBottom: 2 },
        tabBarLabelStyle: {
          fontFamily: t.font.semibold,
          fontSize: t.fontSize['2xs'],
          // 🩸 بلا `lineHeight` صريح يرسم صندوق النصّ بارتفاع السطر الافتراضي
          // للخطّ (9px مع Alexandria) فتُقصّ النوازل من أسفل. Alexandria أطول
          // من خطّ النظام، فتحتاج سطرًا أعلى لا أقل.
          lineHeight: LABEL_LINE_HEIGHT,
        },
      }}
    >
      <Tabs.Screen
        name="orders"
        options={{
          title: 'طلباتي',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'حسابي',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={2.2} />,
        }}
      />
    </Tabs>
  )
}
