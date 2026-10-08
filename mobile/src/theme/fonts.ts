// ⚠️ الاستيراد من **مسارات الأوزان المفردة** لا من جذر الحزمة.
//
// جذر `@expo-google-fonts/alexandria` يصدّر الأوزان التسعة كلها، فيسحب
// `index.js` ملفات `.ttf` التسعة إلى الحزمة — قياس فعلي على `expo export`:
// **1.55 ميجابايت** من الأوزان، منها أربعة لا نستخدمها إطلاقًا
// (`100Thin`, `200ExtraLight`, `300Light`, `900Black`).
//
// الاستيراد من `<weight>/` يسحب ملفًا واحدًا لكل وزن: `400Regular/index.js`
// فيه `require('./Alexandria_400Regular.ttf')` وحده. النتيجة 865 كيلوبايت
// بدل 1.55 ميجابايت — ثلث ما كان، على شبكة جوال في الميدان.
import { Alexandria_400Regular } from '@expo-google-fonts/alexandria/400Regular'
import { Alexandria_500Medium } from '@expo-google-fonts/alexandria/500Medium'
import { Alexandria_600SemiBold } from '@expo-google-fonts/alexandria/600SemiBold'
import { Alexandria_700Bold } from '@expo-google-fonts/alexandria/700Bold'
import { Alexandria_800ExtraBold } from '@expo-google-fonts/alexandria/800ExtraBold'
import { useFonts } from 'expo-font'

/**
 * الخطوط — Alexandria بأوزان الويب الخمسة نفسها.
 *
 * ── لماذا هذه الحزمة بالذات ───────────────────────────────────────────────
 *
 * الويب يحمّل Alexandria عبر `@fontsource/alexandria` (`@import` لأوزان
 * `arabic-400/500/600/700/800` في `globals.css`). لكن fontsource يوزّع
 * **`.woff2` و`.woff` فقط** — وReact Native لا يفكّ أيًّا منهما. يقرأ
 * `.ttf`/`.otf` حصرًا.
 *
 * لذلك المصدر هنا `@expo-google-fonts/alexandria`، وهو يوزّع ملفات `.ttf`
 * **لنفس الخط ونفس الأوزان**. الاسم واحد فالشكل واحد؛ الحزمة مختلفة لأن
 * الصيغة مختلفة، لا لأن الخط مختلف.
 *
 * ── الأوزان قائمة مغلقة ───────────────────────────────────────────────────
 *
 * خمسة فقط، وهي بالضبط المستوردة في الويب. الحزمة تتيح تسعة (من 100 إلى 900)
 * لكن تحميل ما لا يُستخدم يضخّم الحزمة بلا مقابل: كل وزن ملف TTF كامل،
 * وAlexandria العربية ثقيلة نسبيًّا.
 *
 * ⚠️ **لا تطلب وزنًا خارج الخمسة.** إن طلبت `'300'` في `fontWeight` فالنظام
 * يركّب وزنًا صناعيًّا (synthetic) — يميل الحرف ميكانيكيًّا وتبدو العربية
 * مشوّهة. الخطأ صامت: لا تحذير ولا خطأ، فقط شكل رديء.
 */
export const fontFamily = {
  regular: 'Alexandria_400Regular',
  medium: 'Alexandria_500Medium',
  semibold: 'Alexandria_600SemiBold',
  bold: 'Alexandria_700Bold',
  heavy: 'Alexandria_800ExtraBold',
} as const

/** مفتاح عائلة الخط — للاستخدام في `fontFamily` داخل الأنماط. */
export type FontFamilyKey = keyof typeof fontFamily

/**
 * خرائط الوزن الرقمي إلى عائلة الخط.
 *
 * React Native لا يربط `fontWeight` بعائلة مخصّصة: تمرير `fontWeight: '700'`
 * مع `fontFamily: 'Alexandria_400Regular'` **لا** يعطي الخط العريض، بل قد
 * يُركّب وزنًا صناعيًّا. الطريقة الصحيحة هي اختيار **عائلة الوزن** نفسها.
 * هذه الخريطة تجعل ذلك ممكنًا من قيمة رقمية واحدة.
 */
export const fontFamilyByWeight = {
  '400': fontFamily.regular,
  '500': fontFamily.medium,
  '600': fontFamily.semibold,
  '700': fontFamily.bold,
  '800': fontFamily.heavy,
} as const

/**
 * تحميل الخطوط.
 *
 * تُنادى مرّة واحدة في `_layout.tsx` الجذر.
 *
 * ── 🩸 لماذا تُرجع `failed` لا `loaded` وحدها ──────────────────────────────
 *
 * `_layout` يُخفي شاشة البداية **بعد** استقرار الخط، وإلا ظهر النصّ بخط
 * النظام ثم انزاح عند وصول الخط — وهو أوضح عيب بصري في تطبيق عربي. لكن
 * انتظار `loaded` وحدها يعني **تعليقًا أبديًّا** إن فشل التحميل (ملف تالف،
 * شبكة، منصّة لا تدعم `expo-font`). فالحالتان معًا تعنيان «استقرّ»:
 * نجح أو فشل، وكلاهما سبب كافٍ لإخفاء شاشة البداية.
 *
 * و`failed` لا تُسقط التطبيق: يُعرض بخط النظام، وهذا أفضل من شاشة فارغة.
 *
 * ⚠️ **لا تستدعِ `useFonts` في أكثر من موضع.** كل نداء يحمّل المجموعة من
 * جديد ويعيد حالة مستقلة، فيصير عندنا مصدرا حقيقة للخط نفسه.
 */
export function useAppFonts(): { loaded: boolean; failed: boolean } {
  const [loaded, error] = useFonts({
    Alexandria_400Regular,
    Alexandria_500Medium,
    Alexandria_600SemiBold,
    Alexandria_700Bold,
    Alexandria_800ExtraBold,
  })

  return { loaded, failed: Boolean(error) }
}
