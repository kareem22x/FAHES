import { useColorScheme } from 'react-native'

import { darkPalette, lightPalette, statusTones, type Palette, type StatusTone, type ToneColors } from './colors'
import { fontFamily } from './fonts'
import { duration, fontSize, fontWeight, hitTarget, lineHeight, radius, shadow, space } from './tokens'

/**
 * نظام التصميم — نقطة الوصول الواحدة.
 *
 * كل مكوّن في التطبيق يقرأ من هنا: `const t = useTheme()`. لا لون مكتوب
 * مباشرةً في مكوّن، ولا حجم خط مرميّ في مكانه.
 *
 * ── لماذا كائن واحد لا استيرادات متفرّقة ──────────────────────────────────
 *
 * لو استورد المكوّن `lightPalette` مباشرةً لخسر التبديل مع الوضع الداكن،
 * ولو استورد `useColorScheme` بنفسه لتكرّرت قراءة الحالة في كل ملف ولتباعدت
 * القرارات. الحاوية تضمن أن «الوضع الداكن» قرار واحد في مكان واحد.
 */
export type ThemeMode = 'light' | 'dark'

export type Theme = {
  mode: ThemeMode
  colors: Palette
  /** ألوان شارات الحالة — تتبع الوضع تلقائيًّا. */
  tones: Record<StatusTone, ToneColors>
  font: typeof fontFamily
  fontSize: typeof fontSize
  lineHeight: typeof lineHeight
  fontWeight: typeof fontWeight
  radius: typeof radius
  space: typeof space
  shadow: typeof shadow
  duration: typeof duration
  hitTarget: typeof hitTarget
  /** `true` في الوضع الداكن — للاختصار في الشروط. */
  isDark: boolean
}

function buildTheme(mode: ThemeMode): Theme {
  return {
    mode,
    colors: mode === 'dark' ? darkPalette : lightPalette,
    tones: statusTones[mode],
    font: fontFamily,
    fontSize,
    lineHeight,
    fontWeight,
    radius,
    space,
    shadow,
    duration,
    hitTarget,
    isDark: mode === 'dark',
  }
}

/**
 * الوضعان مبنيّان مرّة واحدة على مستوى الوحدة.
 *
 * السبب: `buildTheme` يُنتج كائنًا جديدًا كل نداء، وتمريره إلى `style` يعني
 * مرجعًا جديدًا في كل رسم — فتُبطَل ذاكرة `React.memo` في المكوّنات الفرعية
 * ويُعاد رسم الشجرة كلها بلا سبب. كائنان ثابتان يحلّان ذلك بلا أي تكلفة.
 */
const themes: Record<ThemeMode, Theme> = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
}

/**
 * الثيم الحالي.
 *
 * يتبع وضع النظام (`userInterfaceStyle: automatic` في `app.json`)، فمن
 * جهازه داكن يرى التطبيق داكنًا من أول إطار بلا إعداد.
 *
 * ⚠️ `useColorScheme()` قد تُرجع `null` في أول إطار قبل أن يقرأ الجسر قيمة
 * النظام. نُسقطها إلى `'light'` — وهو الافتراضي المُعلَن للمنتج في
 * `theme-dark.css` («the default theme stays light»).
 */
export function useTheme(): Theme {
  const scheme = useColorScheme()
  return themes[scheme === 'dark' ? 'dark' : 'light']
}

export { fontFamily, type FontFamilyKey } from './fonts'
export * from './colors'
export * from './tokens'
