import { useEffect, useMemo } from 'react'
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass'
import { AppText } from '@/components/ui/text'
import { buildLeafletHtml, type MapMarkerInput } from '@/lib/maps/leaflet-html'
import { useTheme } from '@/theme'

/**
 * الجزء المشترك من الخريطة — ما لا يعرف المنصّة.
 *
 * ── لماذا ملفّ ثالث غير `leaflet-map.tsx` و`leaflet-map.web.tsx` ───────────
 *
 * لأن `react-native-webview` **لا يملك تنفيذًا للويب**: `lib/WebView.js` —
 * المدخل المشترك — يرسم نصًّا أحمر يقول حرفيًّا «React Native WebView does not
 * support this platform». فلو كان للملف الواحد فرع واحد فقط لانهارت معاينة
 * الويب كاملةً (وهي سطح التحقّق الوحيد المتاح بلا محاكي)، ولبقي نصف التصميم
 * غير مرئي.
 *
 * ⇒ فانقسم الملفّ: هذا الملفّ يحمل **الأنواع والمنطق والحالات**، والنصفان
 * يرسمان الغلاف فقط — `WebView` على الجوال و`iframe` على الويب. أي تعديل في
 * `parseMapMessage` أو في حساب المستند يقع هنا مرّة واحدة للطرفين.
 *
 * ── لماذا الخريطة في `WebView` أصلاً ──────────────────────────────────────
 *
 * `react-native-maps` و`expo-maps` يحتاجان بناءً أصليًّا (لا يعمل في Expo Go)
 * ومفتاحًا بفاتورة على أندرويد. أما `WebView` فيُعيد استخدام **نفس Leaflet
 * ونفس بلاطات Esri** التي يستخدمها الويب حرفيًّا، فلا تتباعد الخريطتان.
 * التفاصيل والفخاخ في `lib/maps/leaflet-html.ts` و`lib/maps/tiles.ts`.
 */

/** حالة الخريطة — تُشتقّ من رسائل المستند لا من تخمين. */
export type MapStatus = 'loading' | 'ready' | 'failed'

export type LeafletMapProps = {
  latitude: number
  longitude: number
  /** تقريب مبدئي. تغييره **يعيد بناء المستند** (انظر `useLeafletHtml`). */
  zoom?: number
  /** دبابيس. الهويّة تُقارَن بالمحتوى لا بالمرجع — انظر `markerSignature`. */
  markers?: readonly MapMarkerInput[]
  /** يُنادى بمعرّف الدبّوس عند الضغط عليه. */
  onMarkerPress?: (id: string) => void
  style?: StyleProp<ViewStyle>
}

export type { MapMarkerInput }

/**
 * الرسائل التي يبثّها المستند.
 *
 * أربع فقط، وكلّها **حالات** لا أحداث واجهة: الواجهة لا تحتاج أن تعرف أن
 * المستخدم سحب الخريطة، بل أن تعرف أن الخريطة جاهزة أو معطوبة.
 */
export type MapMessage =
  | { type: 'ready'; zoom: number }
  | { type: 'marker'; id: string }
  | { type: 'tiles-failed'; failed: number }
  | { type: 'error'; reason: string }

/** أقصى طول مقبول لرسالة من الـWebView — حاجز ضد حِمل شاذّ لا أكثر. */
const MAX_MESSAGE_LENGTH = 4096

/**
 * تحويل رسالة خام إلى `MapMessage` أو `null`.
 *
 * ⚠️ لا `as` ولا افتراض: الرسالة تعبر جسرًا نصّيًّا، فأي شكل غير متوقّع يجب
 * أن يُسقَط بهدوء لا أن يصل إلى الواجهة كقيمة مشوّهة. و`null` تعني «تجاهل»
 * — لا تعني خطأ، فالخريطة تعمل بلا هذه الرسالة.
 */
export function parseMapMessage(raw: unknown): MapMessage | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > MAX_MESSAGE_LENGTH) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>

  switch (candidate.type) {
    case 'ready':
      return { type: 'ready', zoom: typeof candidate.zoom === 'number' ? candidate.zoom : 0 }
    case 'marker':
      return typeof candidate.id === 'string' && candidate.id.length > 0
        ? { type: 'marker', id: candidate.id }
        : null
    case 'tiles-failed':
      return {
        type: 'tiles-failed',
        failed: typeof candidate.failed === 'number' ? candidate.failed : 4,
      }
    case 'error':
      return {
        type: 'error',
        reason: typeof candidate.reason === 'string' ? candidate.reason : 'unknown',
      }
    default:
      return null
  }
}

/**
 * فاصلان غير قابلين للالتباس.
 *
 * `\u001f` بين الحقول و`\u001e` بين السجلات. استخدام `:` أو `|` كان سيخلط
 * علامةً في اسم أو عنوان مع الفاصل، فتتشابه بصمتان مختلفتان ⇒ لا يُعاد بناء
 * المستند عند تغيّر حقيقي. (أسماء عربية ولاتينية، ولا احتمال معقول لهذين
 * المحرفين في بيانات المستخدم.)
 */
const FIELD_SEPARATOR = '\u001f'
const RECORD_SEPARATOR = '\u001e'

/**
 * بصمة محتوى قائمة الدبابيس.
 *
 * ── لماذا لا يكفي `useMemo(..., [markers])` ───────────────────────────────
 *
 * لأن المستدعي يبني المصفوفة من بيانات مستوردة، فهويّتها تتغيّر في كل
 * استيراد ناجح. ولو كانت المصفوفة تبعيةً مباشرة لأُعيد بناء نصّ المستند كل
 * مرة، **ولأُعيد تحميل الخريطة كاملةً** — ترتدّ إلى المركز وتفقد موضع
 * المستخدم، بلا أي خطأ ظاهر.
 *
 * فالبصمة تجعل إعادة البناء تحدث عند تغيّر **المحتوى** فقط.
 */
export function markerSignature(markers: readonly MapMarkerInput[] | undefined): string {
  if (!markers || markers.length === 0) return ''
  let signature = ''
  for (const marker of markers) {
    signature +=
      marker.id +
      FIELD_SEPARATOR +
      marker.latitude +
      FIELD_SEPARATOR +
      marker.longitude +
      FIELD_SEPARATOR +
      (marker.label ?? '') +
      RECORD_SEPARATOR
  }
  return signature
}

/**
 * مستند Leaflet جاهز للحقن، **مُذاكَر** ببصمة المحتوى.
 *
 * ⚠️ الفخّ الذي يحرسه هذا الخطّاف: `react-native-webview` يمرّر `source`
 * عبر `resolveAssetSource`، وهي تُعيد **نفس مرجع** الكائن بلا نسخ — فالتحقّق
 * عند React يصير مقارنة مراجع. أي `{ html }` جديد في كل رسم = خاصية جديدة =
 * `loadDataWithBaseURL` جديدة = **إعادة تحميل الخريطة في كل رسم**. لذلك
 * يُذاكَر المستند هنا، ويُذاكَر `source` نفسه في المكوّن.
 */
export function useLeafletHtml({
  latitude,
  longitude,
  zoom = 12,
  markers,
}: {
  latitude: number
  longitude: number
  zoom?: number
  markers?: readonly MapMarkerInput[]
}): string {
  const t = useTheme()

  const theme = t.mode
  const backgroundColor = t.colors.background
  const accentColor = t.colors.accent
  const signature = markerSignature(markers)

  return useMemo(
    () => buildLeafletHtml({ theme, latitude, longitude, zoom, backgroundColor, accentColor, markers }),
    // `markers` مُمَثَّلة بـ`signature` — وبإضافتها هنا تعود العلّة نفسها.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, latitude, longitude, zoom, backgroundColor, accentColor, signature],
  )
}

/**
 * مهلة الجاهزية.
 *
 * الخريطة التي لا تُبلّغ شيئًا تبقى «قيد التحميل» إلى الأبد: مستطيل بلون
 * الخلفية بلا تفسير، وهو أسوأ من رسالة صريحة. تسع ثوانٍ حدّ سخيّ (بلاطات
 * Esri على شبكة بطيئة) ثم نُعلن الفشل.
 */
export const MAP_READY_TIMEOUT_MS = 9000

/**
 * يُعلن الفشل إن لم تصل رسالة `ready` خلال المهلة.
 *
 * يأخذ `setStatus` لا `onTimeout`: مرجع `setState` ثابت من `useState`، فلا
 * حاجة إلى `useRef` لالتقاط أحدث دالة ولا إلى مصفوفة تبعيات متجدّدة.
 */
export function useMapLoadWatchdog(
  status: MapStatus,
  setStatus: (next: MapStatus) => void,
  timeoutMs: number = MAP_READY_TIMEOUT_MS,
): void {
  useEffect(() => {
    if (status !== 'loading') return
    const timer = setTimeout(() => setStatus('failed'), timeoutMs)
    return () => clearTimeout(timer)
  }, [status, setStatus, timeoutMs])
}

/**
 * سطح الخريطة عند غيابها: التحميل والفشل.
 *
 * ── لماذا بطاقة زجاجية في وسط الشاشة لا مستطيل رمادي ──────────────────────
 *
 * «درس CARTO» في `tiles.ts`: بلاطة فاشلة تجيب `200 image/png` بجسم بطاقة لا
 * صورة، فيبقى المستخدم أمام مربّع فارغ لا يعرف أهو ينتظر أم انتهى الأمر.
 * البطاقة تجعل الحالة **مقروءة**: إمّا «جارٍ التحميل» وإمّا «تعذّر» مع سبب
 * وإجراء. ولا تُعرض حالة «جاهزة» أبدًا — عندها لا شيء يعلو الخريطة.
 */
export function MapPlaceholder({
  status,
  onRetry,
  style,
}: {
  status: MapStatus
  onRetry?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()

  if (status === 'ready') return null

  const failed = status === 'failed'

  return (
    // `box-none`: الغلاف الشفّاف لا يبتلع اللمس، والبطاقة وحدها تلتقطه —
    // وإلا صار الغلاف حاجزًا يمنع سحب الخريطة خلفه.
    <View style={[styles.host, style]} pointerEvents="box-none">
      <GlassCard style={styles.card}>
        {failed ? null : <ActivityIndicator size="small" color={t.colors.accent} />}
        <AppText
          variant="label"
          weight="semibold"
          align="center"
          style={failed ? undefined : { marginTop: t.space[3] }}
        >
          {failed ? 'تعذّر تحميل الخريطة' : 'جارٍ تحميل الخريطة…'}
        </AppText>
        {failed ? (
          <AppText variant="caption" tone="muted" align="center" style={{ marginTop: t.space[2] }}>
            تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.
          </AppText>
        ) : null}
        {failed && onRetry ? (
          <Button
            label="أعد المحاولة"
            onPress={onRetry}
            variant="secondary"
            size="sm"
            fullWidth={false}
            style={{ marginTop: t.space[4] }}
          />
        ) : null}
      </GlassCard>
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    // ⚠️ `StyleSheet.absoluteFill` لا `absoluteFillObject`: الأخيرة **حُذفت**
    // من أنواع React Native 0.86 (`Libraries/StyleSheet/StyleSheet.d.ts`
    // يُعلن `absoluteFill` وحدها، ونوعها `AbsoluteFillStyle` — كائن عادي لا
    // معرّف مُسجَّل). فالفروق التي كانت بينهما لم تبقَ.
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    alignItems: 'center',
    maxWidth: 320,
  },
})
