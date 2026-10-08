import { StyleSheet } from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'

import { brandRamp, ink } from '@/theme'

/**
 * خلفية تدرّج الهوية — منقولة من `.auth-aside` في `refresh.css`.
 *
 * ── الأصل في الويب ────────────────────────────────────────────────────────
 *
 * ```
 * background:
 *   radial-gradient(ellipse at 82% 16%, rgb(61 146 245 / 34%), transparent 55%),
 *   linear-gradient(150deg, var(--ink-900), var(--ink-700) 58%, var(--brand-700));
 * ```
 *
 * ── لماذا SVG لا مكتبة تدرّجات ────────────────────────────────────────────
 *
 * `expo-linear-gradient` يضيف حزمة أصلية جديدة مقابل تدرّج **خطّي** فقط،
 * ويحتاج بناءً أصليًّا جديدًا. و`react-native-svg` **مثبَّتة أصلًا** (يستعملها
 * `lucide-react-native`) وفيها `LinearGradient` **و**`RadialGradient` معًا ⇒
 * نحصل على التدرّجين بالضبط بلا أي اعتماد جديد ولا مساس بالحزمة الأصلية.
 *
 * ── ترجمة الزوايا ─────────────────────────────────────────────────────────
 *
 * • `150deg` في CSS: اتجاه سهم التدرّج `(sin150, -cos150) = (0.5, 0.866)`
 *   أي من أعلى عند 25% من اليسار إلى أسفل عند 25% من اليمين ⇒
 *   `x1=0.25 y1=0 → x2=0.75 y2=1`. (الاختصار الشائع `0,0 → 1,1` هو 135° لا
 *   150°، والفرق مرئي في موضع أفتح نقطة.)
 * • `ellipse at 82% 16%` ⇒ `cx=0.82 cy=0.16` بنسبة `r=0.55`.
 * • الوحدات `objectBoundingBox` (الافتراضي) ⇒ الإحداثيات كسور من الصندوق،
 *   وهو ما يجعل التدرّج يتمدّد مع أي ارتفاع للشريط بلا حساب يدوي.
 *
 * ⚠️ الترتيب مقصود: التدرّج الخطّي **أوّلًا** ثم التوهّج فوقه، مطابقةً لترتيب
 * الطبقات في CSS (الطبقة الأولى في القائمة تُرسم **فوق** ما بعدها).
 */
export function AuthBackdrop() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id="fahes-hero" x1="0.25" y1="0" x2="0.75" y2="1">
          <Stop offset="0" stopColor={ink[900]} />
          <Stop offset="0.58" stopColor={ink[700]} />
          <Stop offset="1" stopColor={brandRamp[700]} />
        </LinearGradient>
        <RadialGradient id="fahes-glow" cx="0.82" cy="0.16" r="0.55">
          <Stop offset="0" stopColor="#3d92f5" stopOpacity="0.34" />
          <Stop offset="1" stopColor="#3d92f5" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#fahes-hero)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#fahes-glow)" />
    </Svg>
  )
}
