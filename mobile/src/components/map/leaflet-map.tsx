import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'

import { useTheme } from '@/theme'

import {
  MapPlaceholder,
  parseMapMessage,
  useLeafletHtml,
  useMapLoadWatchdog,
  type LeafletMapProps,
  type MapStatus,
} from './leaflet-map-shared'

/**
 * الخريطة على الجوال — غلاف `WebView` رقيق حول المستند المشترك.
 *
 * ── لماذا هذا الملفّ رقيق إلى هذا الحدّ ───────────────────────────────────
 *
 * كل ما يخصّ الخريطة نفسها (المستند، الرسائل، الحالات) في
 * `leaflet-map-shared.tsx`. هنا **العزل فقط**: تحويل رسائل الجسر إلى حالة،
 * وضبط الخصائص التي تمنع `WebView` من التصرّف كصفحة ويب.
 *
 * ── لماذا لا `react-native-maps` ─────────────────────────────────────────
 *
 * يحتاج بناءً أصليًّا (لا يعمل في Expo Go) ومفتاح Google بفاتورة على أندرويد.
 * و`WebView` يُعيد استخدام نفس Leaflet ونفس بلاطات Esri التي يستخدمها الويب.
 *
 * ── الفخاخ المُعالَجة هنا ─────────────────────────────────────────────────
 *
 *   1. **`source` بمرجع متجدّد = إعادة تحميل الخريطة في كل رسم.** يمرّر
 *      `react-native-webview` الخاصية عبر `resolveAssetSource` التي تُعيد
 *      **نفس مرجع** الكائن، فيصير التحقّق عند React مقارنة مراجع. `{ html }`
 *      مكتوب في مكانه (inline) يعني مستندًا جديدًا في كل رسم ⇒ ترتدّ الخريطة
 *      إلى مركزها وتفقد موضع المستخدم، بلا خطأ. ⇒ `useMemo` على `source`
 *      و`useLeafletHtml` على المحتوى. **هذا ليس تحسينًا، هو شرط صحّة.**
 *   2. **الملاحة داخل الـWebView.** إسناد Esri في المستند رابط `<a>`؛ نقرة
 *      عليه تُبدّل الخريطة بصفحة esri.com. والأسوأ: `react-native-webview`
 *      يفتح الروابط التي **تفشل** في قائمة السماح في **متصفّح النظام** عبر
 *      `Linking.openURL`. فيُسمح بـ`about:blank` وحده ويُمنع ما عداه ⇒ لا
 *      خروج من التطبيق ولا فقدان للخريطة.
 *   3. **وميض أبيض قبل أول بلاطة.** خلفية `WebView` شفّافة افتراضيًّا، فتمرّ
 *      خلفية الشاشة ثم تُرسم الخريطة. تُثبَّت الخلفية على لون الثيم هنا وفي
 *      المستند معًا.
 *   4. **`textZoom`.** أندرويد يكبّر نصّ الصفحة حسب إعداد الخطّ في النظام،
 *      فتتضخّم أسماء الأماكن على البلاطة. `100` تُثبّتها على حجمها الأصلي.
 *   5. **`androidLayerType` يُترك افتراضيًّا** (`'none'`) عن قصد:
 *      `'hardware'` أسرع نظريًّا لكنه معروف بمشاكل التركيب مع الأسطح الشفافة
 *      والتمويه — ونحن نضع أسطحًا زجاجية فوق الخريطة. خريطة ساكنة لا تستحقّ
 *      المخاطرة.
 */

/**
 * ثابت على مستوى الوحدة لا مصفوفة مكتوبة في مكانها.
 *
 * `originWhitelist` يدخل في `useMemo` داخل `react-native-webview` لبناء
 * حارس الملاحة؛ مصفوفة جديدة في كل رسم تُبطل تلك الذاكرة وتُنتج دالّة جديدة
 * في كل مرّة. والثابت يُصلح ذلك بلا أي تكلفة.
 *
 * ⚠️ `'*'` هنا **لا يعني السماح بالملاحة**: الحارس الحقيقي هو
 * `onShouldStartLoadWithRequest` أدناه. لو رفضنا في قائمة السماح لفتح
 * `react-native-webview` الرابط في متصفّح النظام — وهو بالضبط ما نمنعه.
 */
const ORIGIN_WHITELIST = ['*']

/**
 * البروتوكولات المسموح لها أن تُحمَّل داخل الـWebView.
 *
 * `about:blank` هو أصل المستند المحقون (`loadDataWithBaseURL` بلا baseUrl)،
 * و`data:`/`file:` احتياط لاختلاف سلوك بعض إصدارات أندرويد في الإبلاغ عن
 * رابط التحميل الأوّلي. ما عداها **لا يُحمَّل ولا يُفتح**.
 */
const ALLOWED_NAVIGATION_PREFIXES = ['about:blank', 'data:', 'file:']

/** يُعيد سطحًا فارغًا بدل صفحة خطأ إنجليزية يبنيها `WebView` بنفسه. */
function renderNothing() {
  return <View style={StyleSheet.absoluteFill} />
}

export function LeafletMap({
  latitude,
  longitude,
  zoom,
  markers,
  onMarkerPress,
  style,
}: LeafletMapProps) {
  const t = useTheme()
  const html = useLeafletHtml({ latitude, longitude, zoom, markers })

  const [status, setStatus] = useState<MapStatus>('loading')
  const [attempt, setAttempt] = useState(0)

  useMapLoadWatchdog(status, setStatus)

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseMapMessage(event.nativeEvent.data)
      if (!message) return

      if (message.type === 'ready') {
        setStatus('ready')
        return
      }
      // فشل البلاطات وفشل Leaflet نفسها كلاهما «الخريطة غير صالحة» من وجهة
      // المستخدم: لا فرق بين مربّع رمادي وفراغ. التفريق يبقى في السجلّ فقط.
      if (message.type === 'tiles-failed' || message.type === 'error') {
        setStatus('failed')
        return
      }
      onMarkerPress?.(message.id)
    },
    [onMarkerPress],
  )

  const handleShouldStartLoad = useCallback((request: { url: string }) => {
    return ALLOWED_NAVIGATION_PREFIXES.some((prefix) => request.url.startsWith(prefix))
  }, [])

  const handleRetry = useCallback(() => {
    setStatus('loading')
    // إعادة التركيب (`key`) أنظف من `reload()`: تُلغي كل حالة عالقة في
    // الـWebView، لا تُعيد التحميل فقط.
    setAttempt((value) => value + 1)
  }, [])

  // ⚠️ مُذاكَر — انظر الفخّ (1) في رأس الملفّ. هذا السطر هو الفرق بين خريطة
  // ثابتة وخريطة تُعيد تحميل نفسها في كل رسم.
  const source = useMemo(() => ({ html }), [html])

  // الخلفية على الغلاف وعلى الحاوية الأصلية معًا: الأولى تُلوّن عرض React،
  // والثانية تُلوّن سطح الـWebView الأصلي الذي يظهر قبله.
  const backgroundColor = t.colors.background

  return (
    <View style={style}>
      <WebView
        key={attempt}
        source={source}
        originWhitelist={ORIGIN_WHITELIST}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onError={() => setStatus('failed')}
        renderError={renderNothing}
        javaScriptEnabled
        // لا تخزين محلّي ولا جلسة: المستند لا يستخدم أيًّا منهما، وإبقاؤهما
        // يترك بيانات على الجهاز بلا مقابل.
        domStorageEnabled={false}
        // المستند بحجم الشاشة تمامًا ولا يفيض، فالتمرير يُطفأ ليمنع سحب
        // الصفحة بدل سحب الخريطة.
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        // ضغط مطوّل على رابط الإسناد يفتح معاينة — سلوك متصفّح لا تطبيق.
        allowsLinkPreview={false}
        textZoom={100}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        // البلاطات تُخزَّن: العودة إلى الشاشة لا تُعيد تنزيل ما نُزّل.
        cacheEnabled
        style={{ flex: 1, backgroundColor }}
        containerStyle={{ flex: 1, backgroundColor }}
      />
      <MapPlaceholder status={status} onRetry={handleRetry} />
    </View>
  )
}

export default LeafletMap
