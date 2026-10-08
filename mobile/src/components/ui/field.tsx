import { Eye, EyeOff } from 'lucide-react-native'
import { useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native'

import { useTheme } from '@/theme'

import { AppText } from './text'

/**
 * حقل إدخال موحّد: تسمية + أيقونة + حلقة تركيز + رسالة خطأ.
 *
 * ── لماذا مكوّن لا `TextInput` منسوخ ──────────────────────────────────────
 *
 * شاشة الدخول كانت تُنسق `TextInput` مباشرةً في `StyleSheet` خاصّ بها. ومع
 * عشرات النماذج القادمة (طلب فحص، بلاغ فاحص، بيانات سيارة) يعني ذلك أن كل
 * حالة — تركيز، خطأ، تعطيل، اتجاه كتابة — تُعاد كتابتها في كل موضع وتتباعد
 * عند أول تعديل على الرموز.
 *
 * ── قرارات التصميم ────────────────────────────────────────────────────────
 *
 * • **حدّ بسمك ثابت (1.5) يتغيّر لونه فقط.** تبديل `borderWidth` عند التركيز
 *   يُزيح المحتوى نقطةً فيقفز الحقل — وهو أرخص سبب لاهتزاز واجهة.
 * • **حلقة التركيز ظلّ لا حدّ ثانٍ.** طبقة إضافية تعني عنصرًا آخر يُقاس
 *   ويُصان؛ `shadow.sm` يعطي الإحساس نفسه بلا عنصر.
 * • **الأيقونة تتلوّن بالهوية عند التركيز** فتُخبر بمكان المؤشّر بلا نصّ.
 * • **`writingDirection: 'ltr'` تُفرض للبريد وكلمة المرور والرمز.** ترتيب
 *   المحارف اللاتينية داخل حقل عربي يُقلب بلا ذلك، فيظهر `moc.oof` مكان
 *   `foo.com`. المحاذاة تبقى لبداية السطر (`textAlign: 'left'`) لأن المحتوى
 *   لاتيني.
 *
 * ⚠️ الحقل **لا يقبل `style`** عمدًا: من يمرّر نمطًا يتجاوز الرموز ويُنتج
 * حقلًا شاذًّا. ما يحتاج تغييرًا له خاصية (`variant`).
 */

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string
  /** تلميح يظهر أسفل الحقل حين لا يوجد خطأ. */
  hint?: string
  /** رسالة خطأ — تستبدل التلميح وتلوّن الحدّ. */
  error?: string | null
  /**
   * أيقونة الحقل كـ**مكوّن** لا كعنصر جاهز (`icon={Mail}` لا `icon={<Mail/>}`).
   *
   * السبب: الحقل وحده يعرف حالة التركيز، ولو استلم عنصرًا جاهزًا لثبّت
   * المستدعي لونه فبقي رماديًّا داخل حقل مُركَّز. تمرير المكوّن يمنح الحقل
   * حقّ اختيار اللون، وهو قرار يخصّه لا يخصّ الشاشة.
   */
  icon?: React.ComponentType<{ size?: number; color?: string }>
  /** محتوى لاتيني ⇒ اتجاه الكتابة يسارًا. */
  ltr?: boolean
  /** إظهار زر إظهار/إخفاء كلمة المرور. */
  reveal?: boolean
  /**
   * `code` = رمز تحقق: أرقام كبيرة متباعدة في الوسط.
   * `default` = حقل نصّي عادي.
   */
  variant?: 'default' | 'code'
}

const HEIGHT = { default: 54, code: 64 } as const

/**
 * إلغاء حلقة التركيز التي يرسمها المتصفح على الويب.
 *
 * ── لماذا `outlineStyle: 'none'` لا `outlineWidth: 0` ─────────────────────
 *
 * جرّبنا `outlineWidth: 0` أوّلًا **ولم يكفِ**: قيمة `outline-style` التي
 * يضعها المتصفح على العنصر المُركَّز هي `auto`، و`auto` تعني «ارسم حلقة
 * التركيز الأصلية **بعرض يحدّده المتصفح**» — فيتجاهل `outline-width` ويرسمها
 * كاملة بلون تمييز نظام التشغيل. (قياس فعلي على هذا الجهاز:
 * `outline: 0px auto rgb(229, 151, 0)` — أي شريط كهرماني داخل حقل أزرق.)
 * الإلغاء الصحيح هو `outline-style: none`.
 *
 * ── لماذا `as unknown as TextStyle` ──────────────────────────────────────
 *
 * `react-native-web` تُعلن `outlineStyle?: string` فتقبل `'none'`، أما نوع
 * React Native فيقيّدها بـ`'solid' | 'dotted' | 'dashed'` — بلا `'none'`.
 * فالحصر هنا **فجوة في نوع لا في القدرة**، والتحويل محدود بهذا الموضع ومُعلَّل.
 *
 * ⚠️ على الجهاز لا أثر لهذا: React Native الأصلي لا يرسم حلقة تركيز أصلًا،
 * و`null` تعني ألّا يُضاف شيء إلى الأنماط.
 */
const SUPPRESS_WEB_FOCUS_RING =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null

export function TextField({
  label,
  hint,
  error,
  icon: Icon,
  ltr = false,
  reveal = false,
  variant = 'default',
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const t = useTheme()
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(false)

  const isCode = variant === 'code'

  const borderColor = error
    ? t.colors.error
    : focused
      ? t.colors.accent
      : t.colors.border

  const message = error ?? hint

  return (
    <View>
      {label ? (
        <AppText variant="label" weight="semibold" style={{ marginBottom: t.space[2] }}>
          {label}
        </AppText>
      ) : null}

      <View
        style={[
          styles.shell,
          {
            height: HEIGHT[variant],
            backgroundColor: t.colors.surface,
            borderColor,
            borderRadius: isCode ? t.radius.md : t.radius.sm,
            paddingHorizontal: t.space[4],
            gap: t.space[3],
          },
          focused && !error ? t.shadow.sm : null,
        ]}
      >
        {Icon ? (
          <View style={styles.center}>
            <Icon size={20} color={focused ? t.colors.accent : t.colors.textMuted} />
          </View>
        ) : null}

        <TextInput
          {...rest}
          onFocus={(event) => {
            setFocused(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            onBlur?.(event)
          }}
          secureTextEntry={reveal ? !shown : rest.secureTextEntry}
          placeholderTextColor={t.colors.textMuted}
          // ارتفاع السطر: أندرويد يوسّط النصّ رأسيًّا بارتفاع السطر لا بارتفاع
          // الحقل، فتركه `undefined` مع `lineHeight` كبير يُنزل النصّ.
          style={[
            styles.input,
            SUPPRESS_WEB_FOCUS_RING,
            {
              color: t.colors.text,
              fontFamily: isCode ? t.font.bold : t.font.medium,
              fontSize: isCode ? t.fontSize.xl : t.fontSize.md,
              ...(isCode
                ? {
                    textAlign: 'center' as const,
                    // `letterSpacing` يضيف فراغًا **بعد** كل محرف، فيزيح النصّ
                    // المتمركز نصف فراغ إلى اليمين. `paddingLeft` بالمقدار نفسه
                    // يعيده إلى المركز.
                    letterSpacing: 10,
                    paddingLeft: 10,
                    fontVariant: ['tabular-nums' as const],
                  }
                : null),
              ...(ltr || isCode
                ? { writingDirection: 'ltr' as const, textAlign: isCode ? ('center' as const) : ('left' as const) }
                : null),
            },
          ]}
        />

        {reveal ? (
          <Pressable
            onPress={() => setShown((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={shown ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            // الحقل نفسه هدف لمس، لكن الزرّ داخله 20 نقطة ⇒ نوسّع مساحته
            // الصامتة إلى 44 بلا تغيير الشكل.
            hitSlop={12}
            style={styles.center}
          >
            {shown ? (
              <EyeOff size={20} color={t.colors.textMuted} />
            ) : (
              <Eye size={20} color={t.colors.textMuted} />
            )}
          </Pressable>
        ) : null}
      </View>

      {message ? (
        <AppText
          variant="caption"
          tone={error ? 'error' : 'muted'}
          weight={error ? 'semibold' : 'medium'}
          style={{ marginTop: t.space[2] }}
        >
          {message}
        </AppText>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    // ⚠️ `stretch` لا `center`: مع `center` لا يتمدّد `<TextInput>` رأسيًّا
    // فيرث ارتفاع سطر واحد فقط. القياس الفعلي على ويب بمقاس 390×844 أعاد
    // `{ w: 284, h: 18 }` داخل حقل ارتفاعه 54 ⇒ **اللمس كان يعمل على ثلث
    // الحقل فقط**، والنقر أعلى النصّ أو أسفله لا يفعل شيئًا. وهذا خطأ لا
    // يُرى بالعين: الحقل يبدو سليمًا تمامًا.
    alignItems: 'stretch',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    // أندرويد يضيف حشوة داخلية افتراضية تُفسد التوسيط.
    padding: 0,
    // ومع `stretch` يلزم توسيط رأسي صريح على أندرويد (iOS يوسّط افتراضيًّا).
    textAlignVertical: 'center',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
})
