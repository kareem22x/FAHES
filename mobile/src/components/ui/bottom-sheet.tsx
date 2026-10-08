import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { haptic } from '@/lib/haptics'
import { TAB_BAR_CONTENT_HEIGHT, useTheme } from '@/theme'

import { GlassSurface } from './glass'

/**
 * الدرج السفلي القابل للسحب — نواة الشاشة الرئيسية.
 *
 * ── لماذا مكتوب يدويًّا لا بمكتبة ──────────────────────────────────────────
 *
 * `@gorhom/bottom-sheet` هو الخيار المعتاد، لكن نظيره المطلوب
 * (`react-native-reanimated >= 3.16 || >= 4.0.0-`) غير مُثبَت مع الإصدار
 * المستخدم هنا (4.5.1 مع فصل `react-native-worklets`). ودَرْجٌ لا يعمل يعني
 * **شاشة رئيسية لا تعمل** — وهي أغلى شاشة في التطبيق. والمطلوب فعليًّا
 * (ثلاث نقاط ثبات + سحب + خلفية متلاشية) أقلّ بكثير من مكتبة كاملة، فبُنِي
 * على `reanimated` + `gesture-handler` الموجودين أصلًا.
 *
 * ── المبدأ الحاكم: الإزاحة لا الارتفاع ────────────────────────────────────
 *
 * الدرج **بارتفاع الشاشة كاملة**، وحركته `translateY` وحدها. البديل الشائع —
 * تغيير `height` — يُعيد حساب التخطيط في كل إطار (layout pass لكل إطار سحب)
 * فيتقطّع السحب على الأجهزة الضعيفة. أما `transform` فيعمل على **UI thread**
 * بلا إعادة تخطيط إطلاقًا.
 *
 * ونتيجةً لذلك لا تُرى الزوايا السفلية للدرج أبدًا (أسفله خارج الشاشة)،
 * فيكفي نصف قطر واحد لكل الزوايا بدل نصف قطر علويّ خاص.
 *
 * ── المبدأ الثاني: القيمة المشتركة **إزاحة** لا موضعًا مطلقًا ─────────────
 *
 * هذا هو الفرق الذي يجعل الملفّ خاليًا من `useEffect` بالكامل.
 *
 * لو كانت `translateY` موضعًا مطلقًا، لاحتاج تغييرُ القياسات (دوران الشاشة،
 * تغيّر الهامش الآمن) خطّافًا يعيد إسنادها — وإلا بقي الدرج في موضع لا ينتمي
 * لأي نقطة ثبات. أما إذا كانت **إزاحةً من نقطة الثبات الحالية**، فالموضع
 * يُحسب داخل `useAnimatedStyle`:
 *
 *     الموضع = snapY[activeIndex] + offset
 *
 * فحين تتغيّر `snapY` يُعاد حساب الستايل تلقائيًّا (تبعية مُكتشَفة آليًّا)،
 * ويصحّ الموضع بلا أي خطّاف ولا كتابة من الـJS thread.
 *
 * ⚠️ وثمن ذلك سطر واحد لا يجوز حذفه عند تغيير نقطة الثبات: **إعادة الأساس**.
 * الموضع قبل `snapY[قديم] + offset`، ولو غيّرنا الفهرس وحده لقفز الدرج بمقدار
 * `snapY[جديد] − snapY[قديم]`. فتُعدَّل الإزاحة بالمقدار نفسه في اللحظة نفسها
 * فيبقى الموضع متّصلًا، ثم تُنابض الإزاحة إلى الصفر.
 *
 * ── نقط الثبات الثلاث ─────────────────────────────────────────────────────
 *
 *   peek — الشريط الظاهر دائمًا فوق شريط التنقّل (العنوان والإجراء الأساسي)
 *   half — نصف الشاشة (الخيارات)
 *   full — 92% من الشاشة (النموذج كاملًا)
 *
 * ⚠️ الارتفاع المتاح ليس ارتفاع الشاشة: **شريط التنقّل يرسم فوق الدرج**
 * (فهو شقيق لاحق في الشجرة)، فيُحجَب آخر `TAB_BAR_CONTENT_HEIGHT +
 * insets.bottom` منه. لذلك نقطة `peek` تُحسب من فوق الشريط لا من أسفل الشاشة،
 * والمحتوى يحمل حشوة سفلية بقدره — وإلا اختفى زرّ الدفع تحت الشريط في `full`
 * بلا أي خطأ.
 *
 * ── ⚠️ لا `ScrollView` في الجسم، عن قصد ───────────────────────────────────
 *
 * إيماءة السحب معلّقة على الدرج كاملًا. ولو كان في الجسم قائمة تمرير لتخاصمت
 * الإيماءتان: التمرير يبتلع السحب فيتوقّف الدرج عن الحركة عند أوّل تمرير.
 * الحلّ المتعارف عليه (تمرير معطَّل حتى نقطة معيّنة + تسليم بين الإيماءتين)
 * هو بالضبط الموضع الذي تنكسر فيه الأدراج المكتوبة يدويًّا.
 *
 * ⇒ لذلك محتوى هذا الدرج **مُصمَّم ليَسَع** في نقطة `full` بلا تمرير، وهذا
 * شرط على من يستعمله لا صدفة. درجٌ يحتاج تمريرًا يحتاج `ScrollView` خاصًّا
 * به مع تسليم إيماءة — وهو عمل مستقلّ، لا يُحلّ بتمرير خاصية.
 *
 * ── فخاخ مُعالَجة ─────────────────────────────────────────────────────────
 *
 *   1. **الإيماءة تبتلع النقرات**: بلا `activeOffsetY` يُنشَّط السحب من أوّل
 *      حركة، فيُلغى ضغط أي زرّ داخل الدرج (الأزرار تعمل بـ`Pressable`،
 *      وإيماءة `Pan` النشطة تسحب اللمس منها). `±12` يجعل النقرة النظيفة
 *      تمرّ، والسحب يبدأ عند أوّل حركة حقيقية.
 *   2. **المقاومة المطّاطية**: بلا مقاومة يتبع الدرج الإصبع خارج حدوده
 *      فيظهر فراغ تحت الشاشة. `resist` تُخمد ما بعد الحدّ إلى 22%.
 *   3. **إسقاط السرعة**: اختيار أقرب نقطة بالإزاحة وحدها يجعل «رمية» سريعة
 *      قصيرة تفشل في تغيير الحالة (يُشعر المستخدم أن السحب لا يستجيب).
 *      إسقاط `velocityY` مسافةً قبل المقارنة يحلّ ذلك.
 *
 * ── 🩸 `react-hooks/immutability` وقيم `reanimated` المشتركة ──────────────
 *
 * القاعدة (من `eslint-plugin-react-hooks` 7) تمنع تعديل أي قيمة «مُرّرت إلى
 * خطّاف» — ومصفوفة التبعيات تمريرٌ إلى خطّاف. فبمجرد كتابة
 * `[snapY, offset]` يصير `offset` «غير قابل للتعديل»، ويُرفض
 * `offset.value = …` وهو **الاستعمال الوحيد المشروع** له.
 *
 * والعلّة ليست في القاعدة ولا في reanimated، بل في التبعية الزائدة نفسها:
 * `useSharedValue` تُعيد **نفس المرجع** طول عمر المكوّن، فإضافتها إلى مصفوفة
 * تبعيات لا تُغيّر أي سلوك — ضجيج لا أكثر. أُثبت ذلك بمسبار مؤقّت: تعديل
 * `sharedValue.value` داخل `useCallback` بتبعيات فارغة **يمرّ**، ونفس السطر
 * بتبعيات تحتوي القيمة **يُرفض**.
 *
 * ⚠️ وثَبَت أيضًا أن مجرّد **استعمال** القيمة داخل `useEffect` يُلوّثها في
 * المكوّن كله فتُرفض كل تعديلاتها لاحقًا. وهذا سبب إضافي لإلغاء الخطّاف
 * أصلًا (المبدأ الثاني أعلاه) لا لمجرّد التخلّص من تبعية.
 *
 * ⇒ فالحلّ إزالة القيم المشتركة من التبعيات (وهو الأصحّ أصلًا)، مع تعطيل
 * `exhaustive-deps` **سطرًا بسطر** حيث يطلبها — لا تعطيل `immutability` للمشروع
 * كله، لأنها تحرس أخطاء حقيقية (تعديل `props`/`state`) لا علاقة لها بهذا
 * الاستثناء.
 */

/** نقاط الثبات الثلاث، مرتّبة من الأسفل إلى الأعلى. */
export const SHEET_SNAPS = ['peek', 'half', 'full'] as const
export type SheetSnap = (typeof SHEET_SNAPS)[number]

/** نسبة الشاشة التي يشغلها الدرج عند كل نقطة (عدا `peek` — تُقاس بالبكسل). */
const SNAP_RATIO: Record<'half' | 'full', number> = { half: 0.54, full: 0.92 }

/**
 * أقلّ فرق بين نقطتي ثبات.
 *
 * على شاشة قصيرة (أفقيًّا، أو هاتف صغير) قد تتقاطع الحسابات فتصير نقطتان في
 * الموضع نفسه ⇒ `interpolate` يقسم على صفر، والسحب لا يغيّر شيئًا. الفرق
 * الأدنى يمنع الاثنين.
 */
const MIN_SNAP_GAP = 64

/** معامل المقاومة خارج الحدود. 0 = لا حركة إطلاقًا، 1 = بلا مقاومة. */
const DRAG_OVERSHOOT = 0.22

/**
 * معامل إسقاط السرعة (ثانية).
 *
 * `velocityY` بوحدة px/s، فالضرب في 0.12 يعني «أين سيكون الإصبع بعد 120ms
 * لو استمرّ». رمية بـ1200px/s تُسقط 144px — كافية لتجاوز نصف المسافة بين
 * نقطتين متجاورتين.
 */
const VELOCITY_PROJECTION = 0.12

/** نابض متوسّط: يستقرّ في ~300ms بلا ارتداد مزعج. */
const SPRING = { damping: 26, stiffness: 260, mass: 0.9 }

/**
 * يُخمد الحركة خارج الحدّ بدل قصّها.
 *
 * القصّ المباشر (`Math.min`/`Math.max`) يجعل الإصبع يتحرّك والدرج ثابتًا —
 * إحساس «عالق». المقاومة تُبقي استجابة بصرية وتقول «هذا آخر المدى».
 */
function resist(value: number, min: number, max: number): number {
  'worklet'
  if (value < min) return min - (min - value) * DRAG_OVERSHOOT
  if (value > max) return max + (value - max) * DRAG_OVERSHOOT
  return value
}

/** فهرس أقرب نقطة ثبات بعد إسقاط السرعة. */
function nearestSnapIndex(y: number, points: readonly number[], velocityY: number): number {
  'worklet'
  const projected = y + velocityY * VELOCITY_PROJECTION
  let index = 0
  let best = Math.abs(projected - points[0])
  for (let i = 1; i < points.length; i += 1) {
    const distance = Math.abs(projected - points[i])
    if (distance < best) {
      index = i
      best = distance
    }
  }
  return index
}

export type BottomSheetProps = {
  /** الشريط الظاهر دائمًا: العنوان والإجراء الأساسي. */
  header: ReactNode
  children: ReactNode
  /**
   * ارتفاع الجزء الظاهر في وضع `peek`، **بلا** شريط التنقّل.
   * يجب أن يَسَع `header` كاملًا، وإلا اختفى جزء منه في الوضع المطويّ.
   */
  peekHeight?: number
  /** نقطة البداية. تغييرها بعد التركيب **لا أثر له** (حالة أوّلية لا خاصية). */
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

  // ما يحجبه شريط التنقّل أسفل الشاشة — يُطرح من `peek` ويُضاف حشوةً للمحتوى.
  const bottomReserved = TAB_BAR_CONTENT_HEIGHT + insets.bottom

  /**
   * إحداثيات `translateY` لنقاط الثبات الثلاث.
   *
   * مرتّبة من **الأكبر** (peek — الدرج أخفض) إلى **الأصغر** (full — الدرج
   * أعلى)، لأن `translateY` موجب يُنزل. فالفهرس 0 = peek في كل مكان.
   */
  const snapY = useMemo(() => {
    const full = Math.round(screenHeight * (1 - SNAP_RATIO.full))
    const half = Math.max(full + MIN_SNAP_GAP, Math.round(screenHeight * (1 - SNAP_RATIO.half)))
    const peek = Math.max(half + MIN_SNAP_GAP, Math.round(screenHeight - bottomReserved - peekHeight))
    return [peek, half, full] as const
  }, [screenHeight, bottomReserved, peekHeight])

  const initialIndex = SHEET_SNAPS.indexOf(initialSnap)

  const [snapIndex, setSnapIndex] = useState(initialIndex)

  /** الإزاحة من نقطة الثبات الحالية — لا موضع مطلق. انظر المبدأ الثاني. */
  const offset = useSharedValue(0)
  const offsetStart = useSharedValue(0)
  const activeIndex = useSharedValue(initialIndex)

  const notify = useCallback(
    (index: number) => {
      setSnapIndex(index)
      haptic.select()
      onSnapChange?.(SHEET_SNAPS[index])
    },
    [onSnapChange],
  )

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // الفخّ (1): النقرة النظيفة تبقى نقرة، والسحب يبدأ عند حركة حقيقية.
        .activeOffsetY([-12, 12])
        .onStart(() => {
          offsetStart.value = offset.value
        })
        .onUpdate((event) => {
          const index = activeIndex.value
          // `snapY[2]` = full (أعلى نقطة = أصغر Y)، `snapY[0]` = peek.
          // والحدّان إزاحتان من نقطة الثبات الحالية، لا موضعان مطلقان.
          offset.value = resist(
            offsetStart.value + event.translationY,
            snapY[2] - snapY[index],
            snapY[0] - snapY[index],
          )
        })
        .onEnd((event) => {
          const index = activeIndex.value
          const position = snapY[index] + offset.value
          // الفخّ (3): الاختيار على الموضع المُسقَط لا الحالي.
          const next = nearestSnapIndex(position, snapY, event.velocityY)
          const changed = next !== index
          // ⚠️ إعادة الأساس قبل تغيير الفهرس: بلا هذا السطر يقفز الدرج
          // بمقدار `snapY[next] − snapY[index]` في لحظة التثبيت.
          offset.value = offset.value + snapY[index] - snapY[next]
          activeIndex.value = next
          offset.value = withSpring(0, SPRING)
          // ⚠️ لا اهتزاز أثناء السحب: `notify` تُنادى **عند الاستقرار على نقطة
          // مختلفة** فقط. اهتزاز متكرّر وسط إيماءة يُشعر الجهاز بالخلل.
          if (changed) runOnJS(notify)(next)
        }),
    // القيم المشتركة خارج التبعيات عن قصد — انظر الشرح في رأس الملفّ.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- القيم المشتركة مراجع ثابتة
    [snapY, notify],
  )

  const collapse = useCallback(() => {
    const index = activeIndex.value
    if (index === 0) return
    offset.value = offset.value + snapY[index] - snapY[0]
    activeIndex.value = 0
    offset.value = withSpring(0, SPRING)
    notify(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- القيم المشتركة مراجع ثابتة
  }, [snapY, notify])

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: snapY[activeIndex.value] + offset.value }],
  }))

  const backdropStyle = useAnimatedStyle(() => {
    // مشتقّة من الموضع لا من الفهرس المُثبَّت: تتلاشى **مع** السحب بدل أن
    // تقفز عند وصوله، وتبقى متّصلة عند إلغاء السحب في منتصفه.
    const position = snapY[activeIndex.value] + offset.value
    return { opacity: interpolate(position, [snapY[2], snapY[0]], [0.6, 0], Extrapolation.CLAMP) }
  })

  const expanded = snapIndex > 0

  return (
    // `box-none`: الغلاف لا يبتلع لمسًا، وأبناؤه يفعلون.
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim }, backdropStyle]}
        pointerEvents="none"
      />

      {/*
        طبقة إغلاق فوق الحجاب وتحت الدرج، ولا تُركَّب إطلاقًا في وضع `peek`.
        التركيب المشروط أنظف من تبديل `pointerEvents`: الأخير يحتاج حالة
        إضافية تُزامَن مع الإيماءة على UI thread.
      */}
      {expanded ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={collapse}
          accessibilityRole="button"
          accessibilityLabel="إغلاق اللوحة"
        />
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, { height: screenHeight }, sheetStyle]}>
          <GlassSurface radius={t.radius['3xl']} intensity={30} style={styles.surface}>
            <View style={[styles.header, { height: peekHeight }]}>
              <View style={[styles.grabber, { backgroundColor: t.colors.border }]} />
              {header}
            </View>
            <View style={[styles.body, { paddingBottom: bottomReserved + t.space[5] }]}>{children}</View>
          </GlassSurface>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // الارتفاع يُمرَّر من الشاشة — انظر المبدأ الحاكم في رأس الملفّ.
  },
  surface: {
    flex: 1,
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
})
