import { Search, SlidersHorizontal, X } from 'lucide-react-native'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { haptic } from '@/lib/haptics'
import { useTheme } from '@/theme'

import { GlassSurface } from './glass'
import { AppText } from './text'

/**
 * شريط البحث/التحديد العائم — يقف أعلى الخريطة.
 *
 * ── فخّان منقولان من `field.tsx` (كلاهما مُختبَر هناك) ────────────────────
 *
 *   1. **`alignItems: 'center'` على صفّ يحوي `<TextInput>` يجعل ارتفاع الحقل
 *      ارتفاع سطر واحد** — لأن `center` يمنع التمدّد الرأسي. العلاج: ارتفاع
 *      صريح على الحقل نفسه، فلا يعتمد على تمدّد الصفّ.
 *   2. **`outlineWidth: 0` لا يُلغي حلقة تركيز المتصفح** على هدف الويب —
 *      الصحيح `outlineStyle: 'none'`، وهي خارج نوع RN فتحتاج تحويلًا موضعيًّا.
 *
 * ── وضعان في مكوّن واحد ───────────────────────────────────────────────────
 *
 * `onPress` بلا `onChangeText` ⇒ الشريط **زرّ** لا حقل: يُضغط فيفتح شاشة
 * بحث. هذا هو الوضع الصحيح فوق خريطة، لأن الكتابة داخل طبقة عائمة فوق
 * خريطة تحجب نصف الشاشة بلوحة المفاتيح. و`onChangeText` ⇒ حقل حقيقي.
 */

export type SearchBarProps = {
  value?: string
  onChangeText?: (next: string) => void
  /** يُحوّل الشريط إلى زرّ — يُستخدم بدل `onChangeText`. */
  onPress?: () => void
  placeholder?: string
  /** إظهار زرّ الفلاتر في الطرف المقابل. */
  onFilter?: () => void
  /** إظهار زرّ المسح عند وجود نصّ. */
  clearable?: boolean
}

const FIELD_HEIGHT = 52

export function SearchBar({
  value = '',
  onChangeText,
  onPress,
  placeholder = 'إلى أين؟ ابحث عن موقع السيارة',
  onFilter,
  clearable = true,
}: SearchBarProps) {
  const t = useTheme()
  const isButton = !onChangeText && Boolean(onPress)

  const content = (
    <View style={[styles.row, { height: FIELD_HEIGHT, paddingHorizontal: t.space[4] }]}>
      <Search color={t.colors.textMuted} size={20} strokeWidth={2.4} />

      {isButton ? (
        // الشريط زرّ: نصّ نائب بلون التلميح، ولا حقل إدخال أصلًا — فلا لوحة
        // مفاتيح ولا تركيز ولا حاجة إلى إخفاء حلقة.
        <AppText
          variant="body"
          tone="muted"
          numberOfLines={1}
          style={[styles.flex, { marginHorizontal: t.space[3] }]}
        >
          {placeholder}
        </AppText>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.colors.textMuted}
          returnKeyType="search"
          // ⚠️ الارتفاع صريح: انظر الفخّ (1) في رأس الملف.
          style={[
            styles.input,
            {
              height: FIELD_HEIGHT,
              marginHorizontal: t.space[3],
              color: t.colors.text,
              fontFamily: t.font.regular,
              fontSize: t.fontSize.base,
              textAlignVertical: 'center',
            },
            // `outlineStyle` خارج نوع RN — انظر الفخّ (2).
            { outlineStyle: 'none' } as object,
          ]}
        />
      )}

      {clearable && !isButton && value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="مسح البحث"
          hitSlop={10}
          onPress={() => {
            haptic.tap()
            onChangeText?.('')
          }}
        >
          <X color={t.colors.textMuted} size={18} strokeWidth={2.4} />
        </Pressable>
      ) : null}

      {onFilter ? (
        <>
          <View style={[styles.separator, { backgroundColor: t.colors.border }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="الفلاتر"
            hitSlop={8}
            onPress={() => {
              haptic.tap()
              onFilter()
            }}
          >
            <SlidersHorizontal color={t.colors.accent} size={20} strokeWidth={2.4} />
          </Pressable>
        </>
      ) : null}
    </View>
  )

  return (
    <GlassSurface radius={t.radius.pill} intensity={44} style={t.shadow.md}>
      {isButton ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={placeholder}
          onPress={() => {
            haptic.tap()
            onPress?.()
          }}
          android_ripple={{ color: t.colors.borderLight }}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1, minWidth: 0 },
  input: { flex: 1, minWidth: 0, padding: 0 },
  separator: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: 10 },
})
