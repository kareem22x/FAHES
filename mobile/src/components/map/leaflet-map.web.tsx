import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { View } from 'react-native'

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
 * الخريطة على **الويب** — شيم للمعاينة فقط، لا للمنتج.
 *
 * ── لماذا يوجد هذا الملفّ أصلًا ────────────────────────────────────────────
 *
 * `react-native-webview` **لا يملك تنفيذًا للويب**: مدخله المشترك
 * (`lib/WebView.js`) يرسم نصًّا أحمر يقول «React Native WebView does not
 * support this platform». فلو كان الملفّ واحدًا لظهر هذا النصّ مكان الخريطة
 * في **كل معاينة ويب** — ولا يوجد محاكي على هذه الآلة (لا Android SDK ولا
 * `adb` ولا Java)، فمعاينة الويب هي سطح التحقّق البصري الوحيد المتاح.
 *
 * ⇒ فالنصف الويب يستبدل `WebView` بـ`iframe`، وهو **نفس المفهوم**: مستند
 * معزول داخل إطار، يُحقَن نصًّا (`srcDoc`)، ويتواصل بالرسائل. المستند نفسه
 * حرفيًّا (`useLeafletHtml` مشترك) ونفس الرسائل (`parseMapMessage` مشترك) —
 * فلا يفترق ما نُحقّقه عمّا سيُشحن.
 *
 * ⚠️ **ما لا يُثبته هذا الملفّ**: أن `WebView` الأصلي يمرّر الرسائل كما
 * يفعل الأب هنا، وأن خصائصه (الملاحة، `textZoom`، الخلفية) تعمل. تلك
 * تبقى بحاجة إلى جهاز حقيقي — وهي مذكورة كمهمّة مفتوحة.
 *
 * ── لماذا `<iframe>` يعمل داخل مشروع React Native ────────────────────────
 *
 * لأن `@types/react` تُعلن `JSX.IntrinsicElements` لكل وسوم HTML بغضّ النظر
 * عن `lib`، ولأن `lib` هنا يتضمّن `DOM` (`expo/tsconfig.base.json`) فيُحلّ
 * نوع `HTMLIFrameElement`. ووقت التشغيل هو React DOM، فيرسم الوسم كما هو.
 *
 * ── الفخاخ ────────────────────────────────────────────────────────────────
 *
 *   1. **`srcDoc` يُنشئ مستندًا أصله أصل الأب** (لا `null` كما في
 *      `loadDataWithBaseURL` على أندرويد) ⇒ بلاطات Esri تُحمَّل بلا أي
 *      علاقة بـCORS. وهذا فرق حقيقي بين المعاينة والجهاز، فحين تفشل البلاطات
 *      على الجهاز وحده فالسبب مرجّح أن يكون من هذا الباب.
 *   2. **`postMessage` بلا تحقّق من المصدر** يسمح لأي إطار في الصفحة بأن
 *      ينتحل رسائل الخريطة ⇒ يُقارَن `event.source` بإطارنا.
 *   3. **لا تستعمل أنماط React Native على وسم DOM**: مكوّنات RNW تمرّ بأنماطها
 *      عبر مُصرِّف الأنماط، أما الوسم الخام فتصل أنماطه إلى React DOM كما هي
 *      (تحويل camelCase → kebab-case). فكائن CSS صريح أوضح وأسلم من خلط
 *      رموز النظامين — وهو ما يفعله `FRAME_STYLE` أدناه.
 */

/**
 * كائن CSS صريح: هذا وسم DOM لا مكوّن React Native. انظر الفخّ (3).
 *
 * ── 🩸 `inset: 0` وحدها **لا تملأ إطارًا** — وهو خطأ صامت بلا أي أثر ────────
 *
 * `<iframe>` عنصر **مستبدَل** (replaced element). وفي CSS، العنصر المستبدَل
 * ذو `width: auto` يأخذ **عرضه الجوهريّ** (intrinsic) — وهو للـiframe
 * **300×150** بحسب مواصفة HTML — ثم يُهمَل `right`/`bottom` لأن المعادلة
 * صارت مفرطة التحديد (over-constrained). أي أن:
 *
 *     position: absolute; top: 0; left: 0; right: 0; bottom: 0;   ← لا تكفي
 *
 * تُنتج إطارًا مقاسه **300×150** لا مقاس الأب. وقد حدث هذا فعلًا: الخريطة
 * رُسمت في مستطيل 300×150 أعلى الشاشة، وLeaflet قاس حاويةً بهذا المقاس،
 * **والفحوصات كلها مرّت** (لا خطأ ولا تحذير — الوسم موجود والمستند حُمِّل
 * والبلاطات نزلت). الحلّ الوحيد هو `width`/`height` صريحتان بالنسب المئوية.
 *
 * ⇒ لا تحذف السطرين التاليين. `<div>` تُمتدّ بـ`inset: 0` أما `<iframe>` فلا.
 */
const FRAME_STYLE: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
  border: 'none',
  display: 'block',
  backgroundColor: 'transparent',
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
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  useMapLoadWatchdog(status, setStatus)

  // أحدث دالّة في مرجع: المستمع يُسجَّل مرّة واحدة، وبلا هذا تُعاد
  // التسجيلات مع كل تغيّر في هويّة `onMarkerPress` (وهي دالّة مكتوبة في
  // مكانها عند معظم المستدعين).
  const onMarkerPressRef = useRef(onMarkerPress)
  useEffect(() => {
    onMarkerPressRef.current = onMarkerPress
  }, [onMarkerPress])

  useEffect(() => {
    function handleWindowMessage(event: MessageEvent) {
      // الفخّ (2): رسالة من إطار آخر في الصفحة ليست رسالة خريطتنا.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return

      const message = parseMapMessage(event.data)
      if (!message) return

      if (message.type === 'ready') {
        setStatus('ready')
        return
      }
      if (message.type === 'tiles-failed' || message.type === 'error') {
        setStatus('failed')
        return
      }
      onMarkerPressRef.current?.(message.id)
    }

    window.addEventListener('message', handleWindowMessage)
    return () => window.removeEventListener('message', handleWindowMessage)
  }, [])

  const handleRetry = useCallback(() => {
    setStatus('loading')
    setAttempt((value) => value + 1)
  }, [])

  return (
    <View style={[{ backgroundColor: t.colors.background }, style]}>
      {/*
        `key={attempt}` يُعيد بناء الإطار عند «أعد المحاولة» — أنظف من
        إعادة تحميل مستند قديم عالق في ذاكرة الوسيط.

        و`srcDoc` معرّف ثابت من `useLeafletHtml` ⇒ لا يُعاد بناء الإطار في
        كل رسم. نفس علّة `source` على الجوال (رأس `leaflet-map.tsx`) بالحرف.

        ⚠️ لا `onLoad`: حدث `load` يقع حتى لو فشل سكربت Leaflet (فشل سكربت
        لا يُفشل المستند)، فاعتباره دليل جاهزية **كذب** — وهو بالضبط المربّع
        الرمادي الصامت الذي نمنعه. الإشارة الوحيدة المعتبرة هي رسالة
        `ready`، والمهلة في `useMapLoadWatchdog` تحكم إن لم تصل.
      */}
      <iframe
        key={attempt}
        ref={frameRef}
        title="خريطة موقع الفحص"
        srcDoc={html}
        style={FRAME_STYLE}
      />
      <MapPlaceholder status={status} onRetry={handleRetry} />
    </View>
  )
}

export default LeafletMap
