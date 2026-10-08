/**
 * الخريطة الأصلية — `react-native-maps` بدل `WebView` + Leaflet.
 *
 * ⚠️ **هذا الملفّ مكتوب وجاهز لكنه غير مُفعَّل، عن قصد.** لا شيء يستورده، فلا
 * يدخل الحزمة ولا يتغيّر أي سلوك. والسبب مشروح أدناه — اقرأه قبل التفعيل.
 *
 * ── لماذا الخريطة الأصلية أصلًا ───────────────────────────────────────────
 *
 * الخريطة هي **كل** هوية تطبيق التوصيل: الإيماءة، والتكبير بالقرص، وتحريك
 * الكاميرا، وارتداد الدبّابيس. و`WebView` يعطي مستندًا داخل صفحة: الإيماءة
 * تُمرَّر عبر جسر، والكاميرا تقفز بدل أن تنزلق، والقرص يُعالَج في JS thread.
 * ولهذا يبدو تطبيق التوصيل داخل `WebView` «متصفّحًا» لا تطبيقًا.
 *
 * ── 🔴 لماذا لم يُفعَّل ────────────────────────────────────────────────────
 *
 * ثلاثة شروط ناقصة، وكلّها **خارج الشيفرة**:
 *
 *   1. **مفتاح Google على أندرويد.** `app.json` لا يحوي
 *      `android.config.googleMaps.apiKey`. وبلا المفتاح يرسم أندرويد **مربّعًا
 *      رماديًّا** — أي نتيجة أسوأ من `WebView` الحالي، بلا أي خطأ.
 *   2. **بناء أصلي.** حزمة `react-native-maps` وحدة أصلية؛ سلوكها في Expo Go
 *      يحتاج تحقّقًا على جهاز (والملاحظة المسجّلة في `leaflet-map.tsx` تقول إنها
 *      لا تعمل فيه — وهي ملاحظة تحتاج إعادة قياس على SDK 57 لا تصديقًا).
 *   3. **لا جهاز ولا محاكي في هذه الجلسة.** ولم يُتحقّق M1 على جهاز أصلًا.
 *
 * ⇒ تفعيل خريطة لا يمكن قياسها يعني **استبدال تنفيذ يعمل بتنفيذ لم يُجرَّب**،
 * وهو عكس قاعدة هذا المشروع: «لا بديل عن العرض والقياس». ولهذا التفعيل خطوة
 * واعية يقرّرها من يملك جهازًا ومفتاحًا — لا خطوة تُدفع صامتة.
 *
 * ── كيف تُفعَّل (سطر واحد) ────────────────────────────────────────────────
 *
 *   `src/components/map/leaflet-map.native.tsx`:
 *       export { NativeMap as LeafletMap } from './native-map'
 *
 * ملفّ `.native` يتقدّم على `.tsx` في iOS وأندرويد، ويبقى `.web.tsx` على
 * Leaflet ⇒ لا يتغيّر الويب، ولا يُحذف شيء. وللعودة: احذف ملفّ `.native`.
 *
 * ── ما هو مُتحقَّق منه هنا ────────────────────────────────────────────────
 *
 * **الترجمة فقط**: `tsc` يفحص هذا الملفّ ويطابق واجهته بواجهة
 * `LeafletMapProps` المشتركة. أما السلوك على الجهاز فلم يُقس.
 */
import { useCallback, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, { Marker, type Region } from 'react-native-maps'

import { useTheme } from '@/theme'

import type { LeafletMapProps } from './leaflet-map-shared'

/**
 * يحوّل تقريب Leaflet إلى `latitudeDelta`.
 *
 * `360 / 2^zoom` هي العلاقة القياسية بين التقريب ومدى خطوط العرض، وهي تقريب
 * جيّد عبر النطاق كلّه: تقريب 9 ⇒ 0.70 (عدّة مدن)، وتقريب 16 ⇒ 0.0055 (حيّ).
 *
 * ⚠️ والقصّ ليس ترفًا: تقريب أقلّ من 3 يعطي `delta` أكبر من 90 فيُقلب العرض
 * رأسًا على عقب، وتقريب أعلى من 20 يعطي صفرًا فينهار الحساب (`NaN`).
 */
function zoomToDelta(zoom: number): number {
  const safeZoom = Math.min(20, Math.max(3, zoom))
  return Math.min(90, 360 / 2 ** safeZoom)
}

export function NativeMap({
  latitude,
  longitude,
  zoom = 9,
  markers,
  onMarkerPress,
  style,
}: LeafletMapProps) {
  const t = useTheme()
  const mapRef = useRef<MapView>(null)

  /**
   * ⚠️ `Number.isFinite` لا `Number(...)`.
   *
   * `Number('')` تُعيد `0` — أي أن إحداثيًّا مفقودًا يضع الخريطة عند تقاطع
   * غرينتش بدل أن يمنع العرض. وهذا فخّ مسجَّل في هذا المشروع (`MAPS.md`).
   */
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude)

  const region = useMemo<Region>(
    () => ({
      latitude,
      longitude,
      latitudeDelta: zoomToDelta(zoom),
      longitudeDelta: zoomToDelta(zoom),
    }),
    [latitude, longitude, zoom],
  )

  const handleMarkerPress = useCallback(
    (id: string) => () => {
      onMarkerPress?.(id)
    },
    [onMarkerPress],
  )

  if (!valid) {
    return <View style={[styles.fallback, { backgroundColor: t.colors.surface }, style]} />
  }

  return (
    <MapView
      ref={mapRef}
      style={[StyleSheet.absoluteFill, style]}
      initialRegion={region}
      // ⚠️ لا `region` متحكَّم بها: تمريرها يجعل الخريطة تُعاد إلى مركزها عند
      // كل رسم (نفس فخّ `source` في نسخة `WebView`). و`initialRegion` مرّة واحدة.
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      // شعار الخرائط لا يُخفى — شرط ترخيص لا خيار تصميم.
      // ⚠️ الاسم جمع: `showsPointsOfInterests` — والمفرد يمرّ في جافاسكربت
      // ويُهمله `MapView` صامتًا، فلا يُلتقط إلا بـ`tsc`.
      showsPointsOfInterests={false}
      // iOS: أبل تتبع الوضع الداكن للنظام. وأندرويد يحتاج `customMapStyle`.
      userInterfaceStyle={t.isDark ? 'dark' : 'light'}
    >
      {(markers ?? []).map((marker) => (
        <Marker
          key={marker.id}
          coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
          title={marker.label}
          onPress={handleMarkerPress(marker.id)}
          /**
           * ⚠️ `tracksViewChanges={false}` شرط أداء لا تحسين.
           *
           * افتراضيًّا تُعيد الخريطة رسم كل دبّوس في **كل إطار** لالتقاط أي
           * تغيير في محتواه. ومع عشرات الدبابيس يذوب معدّل الإطارات. ولا
           * يتغيّر محتوى دبّوسنا بعد الرسم ⇒ يُطفأ بأمان.
           */
          tracksViewChanges={false}
        />
      ))}
    </MapView>
  )
}

const styles = StyleSheet.create({
  fallback: { flex: 1 },
})
