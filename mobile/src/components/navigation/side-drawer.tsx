import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { GlassSurface } from '@/components/ui/glass'
import { haptic } from '@/lib/haptics'
import { useTheme } from '@/theme'

/**
 * القائمة الجانبية المنزلقة (Slide-over) — **مكتوبة يدويًّا لا بملّاح الأدراج**.
 *
 * ── لماذا لا `expo-router/drawer` ─────────────────────────────────────────
 *
 * الملّاح موجود فعلًا في `expo-router` 57 (مع `react-native-drawer-layout`)،
 * لكن **فتحه برمجيًّا** من داخل شاشة تبويب متداخلة غير مُثبَت:
 *
 *   * `useNavigation()` تُعيد كائن **أقرب** ملّاح — وهو ملّاح التبويبات لا
 *     الدرج، و`openDrawer` تُضيفها حزمة الدرج على كائنها هي وحدها.
 *   * البديل — `DrawerActions.openDrawer()` — **غير مُصدَّر** من `expo-router`:
 *     الفهرس العام يصدّر `useNavigation` و`router` فقط، و`DrawerActions`
 *     تعيش في نسخة داخلية (`react-navigation/native` المُضمَّنة) بلا مسار
 *     عام. أي أن الحلّ سيكون تحويلًا نوعيًّا غير مفحوص إلى داخل حزمة قد
 *     يتغيّر ترتيبها الداخلي في أي ترقية.
 *
 * والمقابل ثقيل: **هذا هو الزرّ الأساسي في الشاشة الرئيسية**. لو لم يفتح
 * الدرج، يسقط نصف التصميم — ولا محاكي على هذه الآلة (لا Android SDK ولا
 * `adb` ولا Java)، فسطح التحقّق الوحيد هو معاينة الويب، وهي لا تشغّل ملّاح
 * الدرج الأصلي. **مكوّن مكتوب هنا قابل للتحقّق؛ ملّاح داخلي غير مُصدَّر ليس
 * كذلك.** (وهذا هو نفس السبب الذي جعل الخريطة تُكتب بـ`WebView` لا بمكتبة.)
 *
 * ── ⚠️ التموضع: `flexDirection` لا `left`/`right` ──────────────────────────
 *
 * هذه أهمّ نقطة في الملفّ، وهي فرق حقيقي بين الجهاز والمعاينة.
 *
 * `I18nManager.doLeftAndRightSwapInRTL` (مفعّل افتراضيًّا) **يقلب**
 * `left`/`right` على الجهاز عند `forceRTL`. لكن `react-native-web` لا يقلبهما
 * — بل `I18nManager.isRTL` هناك **`undefined`** (الوحدة تُعرّف `allowRTL`
 * و`forceRTL` و`getConstants` فقط، والاتجاه يأتي من `dir` في المستند).
 *
 * ⇒ فلو وُضع اللوح بـ`right: 0` لظهر على **اليمين في المعاينة** وعلى
 * **اليسار على الجهاز** — أي أن المعاينة ستُظهر تصميمًا مخالفًا، وهي بالضبط
 * الحالة التي تُخفي أخطاء حقيقية وتُظهر وهمية.
 *
 * الحلّ: لا `left` ولا `right` إطلاقًا. الأب `flexDirection: 'row'` واللوح
 * `justifyContent: 'flex-start'` ⇒ اللوح على **حافة البداية**، وهي اليمين في
 * العربية. و`flex-direction: row` تُقلب في CSS أيضًا حين `dir="rtl"` ⇒
 * **الجهاز والمعاينة يتّفقان**، بلا أي حساب اتجاه.
 *
 * و`translateX` لا تُقلب في RTL (التبديل يخصّ `left`/`right` والهوامش
 * والحشوات والحدود، لا مصفوفة التحويل) ⇒ الإشارة واحدة في الحالتين.
 *
 * ── ⚠️ لا `useEffect` يكتب في القيمة المشتركة ─────────────────────────────
 *
 * نفس قاعدة `bottom-sheet.tsx`: استعمال قيمة مشتركة داخل `useEffect` يُلوّثها
 * فتُرفض كل تعديلاتها بـ`react-hooks/immutability`. والعلاج البنيوي أن نُحرّك
 * **نسبة تقدّم** (`progress` من 0 إلى 1) لا إزاحةً بالبكسل، ويُحسب الموضع
 * داخل `useAnimatedStyle`:
 *
 *     translateX = (1 − progress) × panelWidth
 *
 * فحين يتغيّر عرض الشاشة (دوران) يُعاد حساب الستايل تلقائيًّا لأن `panelWidth`
 * تبعية مُكتشَفة آليًّا — **بلا خطّاف وبلا كتابة من الـJS thread**.
 *
 * ── زرّ الرجوع في أندرويد ─────────────────────────────────────────────────
 *
 * قائمة منزلقة بلا معالجة لزرّ الرجوع تحبس المستخدم: الزرّ يخرج من التطبيق
 * وهو يرى قائمة مفتوحة. المُستمع يُسجَّل **فقط** والقائمة مفتوحة، ويُعيد
 * `true` ليوقف السلوك الافتراضي.
 */

const SPRING = { damping: 30, stiffness: 320, mass: 0.9 }

/** أقصى عرض للوح — على الجهاز اللوحي يصير 82% من الشاشة عرضًا ضخمًا. */
const PANEL_MAX_WIDTH = 340
const PANEL_WIDTH_RATIO = 0.82

type SideDrawerValue = {
  isOpen: boolean
  open: () => void
  close: () => void
  /** نسبة الفتح 0→1 على UI thread. لا تُقرأ في العرض — تُستهلك في الستايل. */
  progress: SharedValue<number>
  /** عرض اللوح المحسوب من الشاشة — يستهلكه حساب الإزاحة. */
  panelWidth: number
}

const SideDrawerContext = createContext<SideDrawerValue | null>(null)

/**
 * حالة القائمة — المزوّد يملكها لأن الزرّ في شاشة واللوح في الجذر.
 *
 * ⚠️ المزوّد يملك **قيمة الحركة أيضًا** لا الحالة وحدها: `open`/`close`
 * تُحرّك القيمة مباشرةً، فلا يحتاج أي مكوّن إلى `useEffect` يُزامن حالة
 * React مع الحركة (وهو الموضع الذي ترفضه `react-hooks/immutability`).
 */
export function SideDrawerProvider({ children }: { children: ReactNode }) {
  const { width: screenWidth } = useWindowDimensions()
  const [isOpen, setIsOpen] = useState(false)

  const panelWidth = Math.min(Math.round(screenWidth * PANEL_WIDTH_RATIO), PANEL_MAX_WIDTH)

  const progress = useSharedValue(0)

  /**
   * ⚠️ دالّة كتابة **واحدة** لا اثنتان — وهذا ليس تنسيقًا بل شرطٌ ليمرّ الملفّ.
   *
   * `react-hooks/immutability` (eslint-plugin-react-hooks 7.1.1) ترفض
   * **الدالّة الثانية** التي تكتب في القيمة المشتركة نفسها، داخل مكوّن يحمل
   * تلك القيمة في `useMemo`. مُشاهَد بالمسبار: دالّتان تكتبان ⇒ خطأ على
   * الثانية وحدها (والأولى نظيفة!)، ودالّة واحدة ⇒ نظيف تمامًا. ولا يُنجي
   * إدراج `progress` في التبعيات ولا إخراجها — الفرق كلّه في عدد الدوالّ.
   *
   * والعلاج هنا **بنيوي لا تحايليّ**: للدرج هدف واحد (مفتوح/مغلق) فيُكتب في
   * موضع واحد، و`open`/`close` غلافان رقيقان لا يكتبان شيئًا. ربحٌ صافٍ فوق
   * إسكات الخطأ: إعداد النابض مكتوب مرّة، وقيمة الهدف معرَّفة في مكان واحد،
   * والواجهة العامة (`open`/`close`) كما كانت للمستهلكين.
   */
  const setOpen = useCallback((next: boolean) => {
    setIsOpen(next)
    progress.value = withSpring(next ? 1 : 0, SPRING)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- القيم المشتركة مراجع ثابتة
  }, [])

  // اللمسة قبل الفتح لا بعده: الاستجابة يجب أن تُحسّ في لحظة الضغط، لا بعد
  // انتهاء الحركة. والغلافان لا يكتبان في القيمة المشتركة (انظر أعلاه).
  const open = useCallback(() => {
    haptic.tap()
    setOpen(true)
  }, [setOpen])

  const close = useCallback(() => setOpen(false), [setOpen])

  const value = useMemo<SideDrawerValue>(
    () => ({ isOpen, open, close, progress, panelWidth }),
    // ⚠️ `progress` **ليست** في التبعيات عن قصد: `useSharedValue` تُعيد مرجعًا
    // ثابتًا لا يتغيّر أبدًا، فلا شيء يُكتشَف بإدراجه. نفس القاعدة في
    // `bottom-sheet.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- القيم المشتركة مراجع ثابتة
    [isOpen, open, close, panelWidth],
  )

  return <SideDrawerContext.Provider value={value}>{children}</SideDrawerContext.Provider>
}

/** حالة القائمة. يرمي خارج المزوّد — خطأ برمجي لا حالة تشغيل. */
export function useSideDrawer(): SideDrawerValue {
  const value = useContext(SideDrawerContext)
  if (!value) throw new Error('useSideDrawer يجب أن يُستخدم داخل <SideDrawerProvider>.')
  return value
}

/**
 * اللوح نفسه — يُركَّب مرّة واحدة في التخطيط الجذري، فوق كل الشاشات.
 *
 * ويُركَّب في الجذر لا في مجموعة التبويبات: يجب أن يعلو **شريط التنقّل**
 * أيضًا، وشريط التنقّل شقيق للشاشات لا ابن لها.
 */
export function SideDrawer({ children }: { children: ReactNode }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { isOpen, close, progress, panelWidth } = useSideDrawer()

  // زرّ الرجوع — يُسجَّل مفتوحًا فقط. انظر رأس الملفّ.
  useEffect(() => {
    if (Platform.OS !== 'android' || !isOpen) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close()
      return true
    })
    return () => subscription.remove()
  }, [isOpen, close])

  const backdropStyle = useAnimatedStyle(() => ({
    // الحجاب يتبع الحركة نفسها، فلا يظهر فجأةً قبل اللوح ولا يتأخّر عنه.
    opacity: progress.value * 0.6,
  }))

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * panelWidth }],
  }))

  return (
    <View
      // `box-none` مغلقًا: اللوح خارج الشاشة والحجاب شفّاف، فلا يجوز أن
      // يعترض أيًّا من لمسات الشاشة تحته.
      pointerEvents={isOpen ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.host]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim }, backdropStyle]}
        pointerEvents="none"
      />

      {/* يُغلق بالضغط خارج اللوح. ولا يُركَّب مغلقًا أصلًا. */}
      {isOpen ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="إغلاق القائمة"
        />
      ) : null}

      <Animated.View style={[styles.panel, { width: panelWidth }, panelStyle]}>
        <GlassSurface
          radius={t.radius['3xl']}
          intensity={34}
          style={[
            styles.surface,
            // الحافة الملاصقة للشاشة بلا تدوير. `borderTopStartRadius` منطقيّة
            // فتُقلب تلقائيًّا في RTL (تُصبح اليمين) — بعكس `left`/`right`.
            { borderTopStartRadius: 0, borderBottomStartRadius: 0 },
          ]}
        >
          <View style={[styles.content, { paddingTop: insets.top + t.space[5], paddingBottom: insets.bottom + t.space[5] }]}>
            {children}
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    // اللوح يُوضع على حافة البداية بالـflex لا بـ`left`/`right`.
    // انظر الشرح المطوّل في رأس الملفّ.
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  panel: {
    height: '100%',
  },
  surface: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
})
