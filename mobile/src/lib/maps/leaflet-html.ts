import { normalizeMapTheme, tileSourceFor, type MapTheme } from './tiles'

/**
 * بناء مستند Leaflet الذي يُحقن في `WebView`.
 *
 * ── لماذا دالة نقيّة لا سلسلة داخل المكوّن ─────────────────────────────────
 *
 * النصّ المُولَّد هو **البرنامج** الذي يرسم الخريطة. خلطه بـJSX يجعله غير
 * قابل للاختبار وغير قابل للقراءة، ويخفي أخطاء الإفلات (escaping) وسط
 * الوسوم. هنا مدخلات ومخرج نصّي واحد — يمكن فحصه بلا مُصيّر.
 *
 * ── لماذا Leaflet في `WebView` أصلًا ──────────────────────────────────────
 *
 * البديلان الأصليان (`react-native-maps` و`expo-maps`) يحتاجان **بناءً
 * أصليًّا** لا يعمل في Expo Go، و`react-native-maps` يحتاج مفتاح Google
 * بفاتورة على أندرويد. أما `WebView` فيعمل في Expo Go بلا بناء، **ويُعيد
 * استخدام نفس Leaflet ونفس البلاطات التي يستخدمها الويب حرفيًّا** — فلا
 * تتباعد الخريطتان.
 *
 * الثمن: طبقة WebView أثقل من خريطة أصلية. لذلك تُقلَّل إلى خلفية ساكنة لا
 * تستقبل لمسًا إلا حيث يجب، وتُبنى مرة واحدة.
 *
 * ── الفخاخ المُعالَجة هنا ─────────────────────────────────────────────────
 *
 *   1. **`viewport` بلا `maximum-scale`**: WebView يعامل الصفحة كصفحة ويب،
 *      فيصغّر الخريطة ويسمح بتقريب الصفحة كلها بدل تقريب الخريطة. النتيجة
 *      خريطة في ربع الشاشة.
 *   2. **`user-scalable=no`**: بدونه يبتلع pinch تقريب الصفحة فلا يصل إلى
 *      Leaflet، ويبقى المستخدم عاجزًا عن التقريب.
 *   3. **خلفية `.leaflet-container` الافتراضية `#ddd`**: تظهر رمادية قبل
 *      وصول أول بلاطة — تُستبدل بلون خلفية الثيم.
 *   4. **`L.Icon.Default` يطلب صورًا نسبية** تـ404 تحت الحزم ⇒ كل الدبابيس
 *      `divIcon` مبنية بـHTML مضمَّن.
 *   5. **درس CARTO**: البلاطة الفاشلة تجيب `200` بجسم بطاقة لا صورة. لذلك
 *      يُحصى `tileerror` ويُبلَّغ عنه بعد أربعة إخفاقات ⇒ تعرف الواجهة أن
 *      الخريطة **معطوبة** لا فارغة، وتعرض بديلًا بدل مربّع رمادي صامت.
 */

export type MapMarkerInput = {
  id: string
  latitude: number
  longitude: number
  /** نصّ قصير يظهر في فقاعة عند الضغط. */
  label?: string
}

export type LeafletHtmlInput = {
  theme: MapTheme | string
  latitude: number
  longitude: number
  zoom: number
  /** لون خلفية الجسم — من لوحة الثيم، حتى لا تظهر وميضًا رماديًّا. */
  backgroundColor: string
  /** لون الهوية — الدبيسة وحدّها. */
  accentColor: string
  markers?: readonly MapMarkerInput[]
}

/** نطاقات صالحة: ما خارجها يجعل Leaflet يرمي أو يرسم في المحيط. */
const LAT_MIN = -90
const LAT_MAX = 90
const LNG_MIN = -180
const LNG_MAX = 180
const ZOOM_MIN = 1
const ZOOM_MAX = 19

/** يقبل `#rgb` و`#rrggbb` و`rgba(...)` فقط — ما عداها يُستبدل. */
function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed
  if (/^rgba?\(\s*[\d.\s,%]+\)$/.test(trimmed)) return trimmed
  return fallback
}

/** يُبقي الرقم داخل نطاقه؛ و`NaN` تعود إلى الافتراضي. */
function clamp(value: unknown, min: number, max: number, fallback: number): number {
  // ⚠️ `Number('')` تساوي 0 — فالسلسلة الفارغة تصير خطّ الاستواء لا خطأ.
  // لذلك نرفض غير الرقم أولًا، ولا نعتمد على `Number.isFinite` وحدها.
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

/** إفلات نصّ يُدرَج في HTML — العلامات وعلامات التنصيص فقط. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** يمنع إغلاق وسم `<script>` من داخل بيانات. */
function escapeForScript(value: string): string {
  return value.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

/**
 * المستند الكامل. يُعاد كنصّ جاهز لـ`source={{ html }}`.
 */
export function buildLeafletHtml(input: LeafletHtmlInput): string {
  const theme = normalizeMapTheme(input.theme)
  const source = tileSourceFor(theme)

  const lat = clamp(input.latitude, LAT_MIN, LAT_MAX, 24.7136)
  const lng = clamp(input.longitude, LNG_MIN, LNG_MAX, 46.6753)
  const zoom = Math.round(clamp(input.zoom, ZOOM_MIN, ZOOM_MAX, 11))

  const background = safeColor(input.backgroundColor, theme === 'dark' ? '#0b1220' : '#f5f8fd')
  const accent = safeColor(input.accentColor, '#2563eb')

  const markers = (input.markers ?? [])
    .filter(
      (m) =>
        Number.isFinite(m.latitude) &&
        Number.isFinite(m.longitude) &&
        m.latitude >= LAT_MIN &&
        m.latitude <= LAT_MAX &&
        m.longitude >= LNG_MIN &&
        m.longitude <= LNG_MAX,
    )
    .map((m) => ({
      id: String(m.id),
      lat: m.latitude,
      lng: m.longitude,
      label: typeof m.label === 'string' ? escapeHtml(m.label.slice(0, 120)) : '',
    }))

  // ⚠️ لا قوالب نصّية داخل هذا النصّ: المستند نفسه قالب، فـ`${` بالداخل
  // تُنهيه. لذلك كل التركيب بجمع النصوص.
  const markersJson = escapeForScript(JSON.stringify(markers))

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${background}; }
  #map { position: absolute; inset: 0; background: ${background}; }
  /* الرمادي الافتراضي (#ddd) يظهر قبل أول بلاطة — يُستبدل بلون الثيم. */
  .leaflet-container { background: ${background}; font-family: -apple-system, system-ui, sans-serif; }
  /* أزرار Leaflet الافتراضية بيضاء بحدودها — تخالف لغة الأسطح العائمة. */
  .leaflet-control-zoom a {
    background: ${background}; color: ${accent};
    border: 1px solid rgba(128,128,128,0.25); border-radius: 10px;
  }
  .leaflet-control-attribution {
    direction: ltr; font-size: 9px; padding: 1px 5px;
    background: rgba(255,255,255,0.55); border-radius: 6px 0 0 0;
  }
  .leaflet-bar { border: 0 !important; box-shadow: none !important; }
  .fahes-pin {
    width: 22px; height: 22px; border-radius: 999px;
    background: ${accent}; border: 3px solid #ffffff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35); box-sizing: border-box;
  }
  .fahes-pin-dot {
    width: 14px; height: 14px; border-radius: 999px;
    background: ${accent}; border: 3px solid #ffffff;
    box-shadow: 0 0 0 6px ${accent}33, 0 2px 8px rgba(0,0,0,0.35); box-sizing: border-box;
  }
  .fahes-popup {
    direction: rtl; font-size: 12px; font-weight: 600; color: #102444;
  }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  function post(payload) {
    var json = JSON.stringify(payload);
    // الجوال: جسر react-native-webview.
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(json);
      return;
    }
    // الويب: المستند داخل iframe، والأب هو من يعرض الحالة. نفس المستند
    // ونفس الرسائل ⇒ الحالات تُختبر في المعاينة كما تُختبر على الجوال.
    // الشرط يمنع الإرسال إلى النفس حين يكون المستند هو الإطار الأعلى.
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(json, '*');
    }
  }

  if (!window.L) { post({ type: 'error', reason: 'leaflet_missing' }); return; }

  var map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    // بلا حركة تقريب: الخريطة خلفية ساكنة، والحركة تُستهلك على UI thread.
    zoomAnimation: false,
    fadeAnimation: false,
    // تكبير بالعجلة معطّل: لا عجلة على الجوال، وإبقاؤه يفتح تقريبًا عرضيًّا.
    scrollWheelZoom: false,
    // لا تدوير ولا نقر مزدوج: كلاهما يزعج في خريطة تُسحب بالإصبع.
    doubleClickZoom: false,
    touchZoom: true,
    dragging: true,
    // ⚠️ 16 لا أكثر: خدمات Esri Canvas تتوقّف عنده (انظر tiles.ts).
    maxZoom: ${source.maxZoom},
    minZoom: ${ZOOM_MIN}
  }).setView([${lat}, ${lng}], ${zoom});

  var failed = 0;
  var reported = false;

  function onTileError() {
    failed += 1;
    // ⚠️ درس CARTO: البلاطة الفاشلة تجيب 200 بجسم بطاقة لا صورة.
    // أربعة إخفاقات تعني أن المصدر معطوب لا أن الخريطة بطيئة.
    if (failed >= 4 && !reported) {
      reported = true;
      post({ type: 'tiles-failed', failed: failed });
    }
  }

  // ⚠️ بلا crossOrigin: إضافته تحوّل طلب الصورة إلى وضع CORS فيصبح نجاح
  // البلاطة معلَّقًا على ترويسة من طرف ثالث — والمستند هنا أصله «null»
  // (يُحمَّل بـloadDataWithBaseURL بلا baseUrl)، ولا حاجة أصلاً بقراءة
  // بكسلات البلاطة. وخريطة الويب العاملة لا تضبطه. أُزيل بعد مراجعتها.
  //
  // ⚠️ ولا محرف backtick في هذا التعليق: التعليق داخل قالب نصّي (template
  // literal)، فأوّل backtick يُنهي القالب ويُسقط التحليل النحوي بخطأ مضلِّل
  // (TS1005/TS1443 عند سطر لاحق تمامًا) لا عند سببه.
  var base = L.tileLayer(${JSON.stringify(source.url)}, {
    maxZoom: ${source.maxZoom},
    attribution: ${JSON.stringify(source.attribution)}
  }).on('tileerror', onTileError).addTo(map);
${
  source.labelsUrl
    ? `
  L.tileLayer(${JSON.stringify(source.labelsUrl)}, { maxZoom: ${source.maxZoom} })
    .on('tileerror', onTileError)
    .addTo(map);
`
    : ''
}
  var markers = ${markersJson};
  var pulse = L.divIcon({
    className: '',
    html: '<div class="fahes-pin-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  var pin = L.divIcon({
    className: '',
    html: '<div class="fahes-pin"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  for (var i = 0; i < markers.length; i++) {
    var m = markers[i];
    var layer = L.marker([m.lat, m.lng], { icon: m.label ? pin : pulse });
    if (m.label) {
      layer.bindPopup('<span class="fahes-popup">' + m.label + '</span>');
    }
    layer.on('click', (function (id) {
      return function () { post({ type: 'marker', id: id }); };
    })(m.id));
    layer.addTo(map);
  }

  // الإشارة الوحيدة التي تنتظرها الواجهة: الخريطة رُكّبت فعلًا.
  map.whenReady(function () {
    post({ type: 'ready', zoom: map.getZoom() });
  });
})();
</script>
</body>
</html>`
}
