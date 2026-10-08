import GorhomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet'
import { useCallback, useMemo, type ReactNode } from 'react'
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { haptic } from '@/lib/haptics'
import { TAB_BAR_CONTENT_HEIGHT, useTheme } from '@/theme'

import { GlassSurface } from './glass'

/**
 * الدرج السفلي — غلاف رقيق حول `@gorhom/bottom-sheet`.
 *
 * ── 🩸 لماذا أُعيد كتابة هذا الملفّ (اقرأ قبل أن تعيده يدويًّا) ────────────
 *
 * كان مكتوبًا يدويًّا على `reanimated` + `gesture-handler`، والسبب المكتوب
 * حينها أن `@gorhom/bottom-sheet` يحتاج `reanimated >= 3.16` وهو «غير مُثبَت»
 * مع الإصدار المستخدم (4.5.1). **هذا السبب كان خاطئًا**: `5.2.14` يعلن
 * `"react-native-reanimated": ">=3.16.0 || >=4.0.0-"`، أي دعم صريح لـ4.x منذ
 * `5.1.8`.
 *
 * والثمن كان فادحًا، وهو **قيد تقني فُرض على التصميم**: النسخة اليدوية
 * كانت **تمنع `ScrollView` في الجسم عمدًا** (لأن إيماءة السحب كانت معلّقة على
 * الدرج كاملًا فتخاصم التمرير). فصار كل درج في التطبيق ملزمًا بأن يَسَع محتواه
 * بلا تمرير — ولهذا بدا التصميم ثابتًا ورخيصًا. لا يوجد تطبيق توصيل تُعرض فيه
 * تفاصيل الطلب بلا تمرير.
 *
 * ── الإثبات (مقيس، لا مُفترَض) ────────────────────────────────────────────
 *
 * قيس مسبار معزول في متصفّح حقيقي على `390×844`:
 *   • أخطاء وقت التشغيل: **0**
 *   • `scrollHeight 2059` ⇒ `scrollTop = 500` **نجح** (التمرير يعمل)
 *   • نقر زرّ داخل الدرج ⇒ حالة React تحدّثت (`taps 0` ⇒ `taps 1`)
 *   • `snapToIndex(2)` ⇒ `y: 682` ⇒ `y: 92` (نابض reanimated على UI thread)
 *   • حقل نصّي ⇒ `<input type="text">` حقيقي
 *
 * ⚠️ **تحذير `could not find scrollable ref!` على الويب وحده — مقبول.**
 * مصدره `findNodeHandle.web.ts` (ملفّ `.web` لا نظير له على الجوال): يحاول
 * الحصول على مرجع عنصر التمرير من `react-native-web` فلا يجده، **ثم يُعيد
 * المرجع نفسه** (`return componentOrHandle`) — تدهور رشيق لا فشل. والدليل
 * أن التمرير والـ`snap` قياسًا يعملان. وعلى iOS/Android يُستخدم ملفّ آخر
 * تمامًا فلا يمكن أن يظهر أصلًا.
 *
 * ── نقط الثبات: بالبكسل لا بالنسبة ────────────────────────────────────────
 *
 * `snapPoints` عند gorhom **ارتفاع الدرج من أسفل الحاوية** (لا موضع `translateY`
 * كما في النسخة اليدوية). وهذا أبسط: لا إعادة أساس ولا موضع مطلق.
 *
 * ⚠️ ولا تُستعمل النِّسب (`'54%'`) عن قصد. النسبة تُحسب من ارتفاع الحاوية
 * مطروحًا منه الهوامش، فيصير من الصعب الجزم بأن `peek` يَسَع الشريط — وهو
 * الموضع الذي كان يختفي فيه زرّ الدفع تحت شريط التنقّل في النسخة اليدوية.
 * الأرقام الصريحة تُقاس.
 *
 * ── ⚠️ ثلاث إضافات لا يجوز حذفها من `peek` ────────────────────────────────
 *
 *   `bottomReserved`  شريط التنقّل يرسم **فوق** الدرج (فهو شقيق لاحق في
 *                     الشجرة) ⇒ آخر `TAB_BAR_CONTENT_HEIGHT + insets.bottom`
 *                     منه محجوب. بلا هذه الإضافة يختفي جزء من الشريط الظاهر.
 *   `HANDLE_HEIGHT`   المقبض يُرسم **فوق** المحتوى ويأكل من أعلى الدرج،
 *                     والمحتوى يبدأ بعده. بلا هذه الإضافة يُقصّ أسفل العنوان.
 *
 * والحشوة السفلية للمحتوى بنفس `bottomReserved` — وإلا اختفى زرّ الدفع تحت
 * الشريط في نقطة `full` بلا أي خطأ ولا تحذير.
 *
 * ── لوحة المفاتيح: مُعالَجة داخل الدرج لا خارجه ───────────────────────────
 *
 * `keyboardBehavior="interactive"` (يُزيح الدرج بمقدار اللوحة) و
 * `keyboardBlurBehavior="restore"` (يُعيده لمكانه عند الإغلاق). وأي حقل داخل
 * الدرج **يجب** أن يكون `BottomSheetTextInput` لا `TextInput` عاديًّا: الأول
 * يُبلّغ الدرج بأحداث التركيز فيتحرّك، والثاني يترك اللوحة تغطّي الحقل.
 *
 * ── ما لم يتغيّر ──────────────────────────────────────────────────────────
 *
 * الواجهة البرمجية كما هي (`header` · `children` · `peekHeight` ·
 * `initialSnap` · `onSnapChange`) — والمستهلكون لا يحتاجون تعديلًا. الفرق
 * السلوكي الوحيد أن المحتوى **صار قابلًا للتمرير**، وأن العنوان انتقل إلى داخل
 * منطقة التمرير فيتلاشى عند السحب للأعلى (وهو سلوك تطبيقات التوصيل).
 */

/** نقاط الثبات الثلاث، مرتّبة من الأسفل إلى الأعلى. */
export const SHEET_SNAPS = ['peek', 'half', 'full'] as const
export type SheetSnap = (typeof SHEET_SNAPS)[number]

/** نسبة الشاشة التي يشغلها الدرج عند كل نقطة (عدا `peek` — تُقاس بالبكسل). */
const SNAP_RATIO: Record<'half' | 'full', number> = { half: 0.54, full: 0.92 }

/**
 * ارتفاع المقبض الذي يستهلكه الدرج أعلى المحتوى.
 *
 * مقيس من `styles.handleWrap` + `styles.grabber` (10 + 5 + 12 = 27) ومقرَّب
 * إلى 28. يُضاف إلى نقطة `peek` لأنه **لا** يدخل في `peekHeight` الذي يمرّره
 * المستهلك (والمستهلك يحسب مساحة العنوان وحده).
 */
const HANDLE_HEIGHT = 28

/** أقلّ فرق بين نقطتي ثبات — يمنع تقاطعهما على شاشة قصيرة. */
const MIN_SNAP_GAP = 64

export type BottomSheetProps = {
  /** الشريط الظاهر دائمًا: العنوان والإجراء الأساسي. */
  header: ReactNode
  children: ReactNode
  /**
   * ارتفاع الجزء الظاهر في وضع `peek`، **بلا** شريط التنقّل وبلا المقبض.
   * يجب أن يَسَع `header` كاملًا، وإلا اختفى جزء منه في الوضع المطويّ.
   */
  peekHeight?: number
  /** نقطة البداية. */
  initialSnap?: SheetSnap
  onSnapChange?: (snap: SheetSnap) => void
  style?: StyleProp<ViewStyle>
}

export function BottomSheet({
  header,
  children,
  peekHeight = 116,
  initialSnap = 'peek',
  onSnapChange,
  style,
}: BottomSheetProps) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { height: screenHeight } = useWindowDimensions()

  // ما يحجبه شريط التنقّل أسفل الشاشة — يُضاف إلى `peek` ويُصبح حشوةً للمحتوى.
  const bottomReserved = TAB_BAR_CONTENT_HEIGHT + insets.bottom

  /**
   * ارتفاعات الدرج الثلاث من أسفل الحاوية.
   *
   * ⚠️ كل ارتفاع **مستقلّ** عن سابقه في gorhom (بخلاف الإزاحة في النسخة
   * اليدوية)، لكن الحدّ الأدنى للفرق يبقى لازمًا: على شاشة قصيرة أو في الوضع
   * الأفقي قد تتقاطع النسبتان فتصير نقطتان في الارتفاع نفسه ⇒ لا يستجيب السحب.
   */
  const snapPoints = useMemo(() => {
    const peek = Math.round(peekHeight + bottomReserved + HANDLE_HEIGHT)
    const half = Math.max(peek + MIN_SNAP_GAP, Math.round(screenHeight * SNAP_RATIO.half))
    const full = Math.max(half + MIN_SNAP_GAP, Math.round(screenHeight * SNAP_RATIO.full))
    return [peek, half, full]
  }, [peekHeight, bottomReserved, screenHeight])

  const initialIndex = SHEET_SNAPS.indexOf(initialSnap)

  /**
   * ⚠️ لا اهتزاز أثناء السحب: `onChange` تُنادى **عند الاستقرار على نقطة
   * مختلفة** فقط. اهتزاز متكرّر وسط إيماءة يُشعر الجهاز بالخلل.
   */
  const handleChange = useCallback(
    (index: number) => {
      haptic.select()
      const snap = SHEET_SNAPS[index]
      if (snap) onSnapChange?.(snap)
    },
    [onSnapChange],
  )

  // الحجاب يظهر من النقطة الثانية — في `peek` يبقى الدرج جزءًا من الشاشة لا نافذة.
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={1}
        disappearsOnIndex={0}
        opacity={0.6}
        pressBehavior="collapse"
      />
    ),
    [],
  )

  /**
   * خلفية الدرج = سطح زجاجي من لغة التطبيق.
   *
   * ⚠️ `style` هنا **نمط عاديّ** لا `AnimatedStyle`: مصدره
   * `BottomSheetBackgroundContainer` وهو يمرّر
   * `[StyleSheet.absoluteFill, backgroundStyle]` إلى `View` عاديّ. لذلك يجوز
   * تمريره إلى `GlassSurface` مباشرةً بلا `Animated.View` — وقد تُحقّق من
   * المصدر لا بالافتراض.
   *
   * والتمويل (`BlurView`) يعمل فوق الخريطة وهو أصل اللغة البصرية هنا، لكن
   * اللون وحده يكفي لو سقط التمويه (انظر رأس `glass.tsx`).
   */
  const renderBackground = useCallback(
    ({ style: backgroundStyle }: BottomSheetBackgroundProps) => (
      <GlassSurface radius={t.radius['3xl']} intensity={30} style={backgroundStyle} />
    ),
    [t],
  )

  const renderHandle = useCallback(
    () => (
      <View style={styles.handleWrap} testID="sheet-handle">
        <View style={[styles.grabber, { backgroundColor: t.colors.border }]} />
      </View>
    ),
    [t],
  )

  return (
    <GorhomSheet
      index={initialIndex}
      snapPoints={snapPoints}
      // يُطرح من ارتفاع الحاوية عند حساب النِّسب — ولا يضرّ بالأرقام الصريحة.
      topInset={insets.top}
      // النقاط معطاة صريحة ⇒ القياس الديناميكي يُطفأ وإلا تجاوزها.
      enableDynamicSizing={false}
      // الدرج جزء دائم من الشاشة الرئيسية لا نافذة تُغلق.
      enablePanDownToClose={false}
      // بلا هذا يبدأ الدرج من الأسفل ويصعد عند كل إقلاع.
      animateOnMount={false}
      backdropComponent={renderBackdrop}
      backgroundComponent={renderBackground}
      handleComponent={renderHandle}
      onChange={handleChange}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      containerStyle={style}
    >
      {/*
        `BottomSheetScrollView` لا `ScrollView` — وهو **شرط** لا تحسين:
        الأول يُبلّغ الدرج بأحداث التمرير فيتسلّم السحب عند بلوغ أعلى القائمة،
        والثاني يخاصم إيماءة الدرج (وهو بالضبط ما منع التمرير في النسخة اليدوية).
      */}
      <BottomSheetScrollView
        testID="sheet-scroll"
        contentContainerStyle={{
          paddingHorizontal: t.space[5],
          paddingBottom: bottomReserved + t.space[5],
        }}
        showsVerticalScrollIndicator={false}
        // النقرة على زرّ لا يجوز أن تُستهلك في إغلاق اللوحة.
        keyboardShouldPersistTaps="handled"
      >
        {header}
        {children}
      </BottomSheetScrollView>
    </GorhomSheet>
  )
}

const styles = StyleSheet.create({
  handleWrap: {
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: 'center',
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 999,
  },
})
