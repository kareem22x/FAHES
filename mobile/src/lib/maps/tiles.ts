/**
 * بلاطات الخريطة — منقولة من `lib/maps/tiles.ts` في الويب.
 *
 * ── لماذا نفس المصدر بالضبط ───────────────────────────────────────────────
 *
 * الخريطة في التطبيق **ليست خريطة ثانية**: هي نفس بلاطات Esri بنفس الطبقات
 * ونفس الحدود. لو اخترنا مزوّدًا آخر للتطبيق لظهرت مدينة واحدة بشكلين،
 * ولاختلفت الأسماء والحدود بين ما يراه العميل في المتصفّح وما يراه في الجوال
 * — وهو أسوأ من ألّا تكون هناك خريطة.
 *
 * ── لماذا لا Google Maps ──────────────────────────────────────────────────
 *
 * واجهة Google تحتاج مفتاحًا بفاتورة مفعَّلة، والخريطة ترسم علامة مائية
 * رمادية «لأغراض التطوير فقط» حتى يُلصق المفتاح. وLeaflet فوق بلاطات مفتوحة
 * بلا مفتاح ولا حساب ولا سكربت طرف ثالث.
 *
 * ── لماذا Esri لا CARTO ───────────────────────────────────────────────────
 *
 * CARTO كان الخيار الأول، وما زال يجيب `200 image/png` — ولهذا كاد الخطأ
 * يمرّ. الجسم بطاقة 2KB مكتوب عليها «API KEY REQUIRED» لا بلاطة خريطة
 * (بلاطة z9 حقيقية ≈7KB، وبلاطة z13 لمدينة ≈17KB). **`200` بنوع محتوى
 * معقول لا يُثبت شيئًا عن صورة** — الحجم والبكسلات وحدهما يُثبتان.
 *
 * ⚠️ **فخّان خاصّان بـEsri** (كلاهما صامت):
 *   1. قالب الرابط `{z}/{y}/{x}` — **صف قبل عمود**. Leaflet يستبدل
 *      العناصر المسمّاة، فكتابة `{x}/{y}` تطلب بلاطة خاطئة من خريطة تبدو
 *      سليمة تمامًا.
 *   2. خدمات `Canvas` تتوقّف عند z16. فوقها تجيب `200` بجسم فارغ 2.5KB،
 *      فرقم `maxZoom` أكبر يُظهر رماديًا فارغًا في اللحظة التي يقرّب فيها
 *      المستخدم ليقرأ اسم شارع.
 *
 * وطبقة `Reference` شفافة منفصلة تحمل الأسماء: هي ما يجعل الخريطة الداكنة
 * قابلة للاستعمال، لأن دمج الأسماء في البلاطة الأساسية يجعلها غير مقروءة.
 */

export type MapTheme = 'light' | 'dark'

export type TileSource = {
  readonly url: string
  /** طبقة أسماء شفافة تُرسم فوق الأساس. تُحذف إن لم يكن للمزوّد طبقة أسماء. */
  readonly labelsUrl?: string
  readonly attribution: string
  readonly maxZoom: number
}

const ESRI_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const ESRI_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas'

/** أعلى تقريب تخدمه خدمات Esri Canvas — انظر الشرح أعلاه. */
export const ESRI_MAX_ZOOM = 16

export const TILE_SOURCES: Record<MapTheme, TileSource> = {
  light: {
    url: `${ESRI_BASE}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI_BASE}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
    maxZoom: ESRI_MAX_ZOOM,
  },
  dark: {
    url: `${ESRI_BASE}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI_BASE}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
    maxZoom: ESRI_MAX_ZOOM,
  },
}

/**
 * أي قيمة ليست `'dark'` بالضبط تُعتبر فاتحة.
 *
 * الوضع يأتي من حالة التطبيق، لكن الدالة تبقى متسامحة كما في الويب: قيمة
 * غير متوقّعة تعطي الوضع الافتراضي (فاتح) لا رميًا يُسقط الخريطة.
 */
export function normalizeMapTheme(value: unknown): MapTheme {
  return value === 'dark' ? 'dark' : 'light'
}

/**
 * مصدر البلاطات للوضع، مع احترام تخطّي البيئة.
 *
 * التخطّي يستبدل **الأساس فقط**: الإسناد يبقى (إسقاطه يخالف شروط أي مزوّد)،
 * وطبقة الأسماء تُحذف لأن أساسًا مخصّصًا لن ينطبق على أسماء Esri — ورسم أسماء
 * أجنبية فوق خريطة غيرها أسوأ من عدم رسمها.
 */
export function tileSourceFor(theme: unknown): TileSource {
  const source = TILE_SOURCES[normalizeMapTheme(theme)]
  const override = process.env.EXPO_PUBLIC_MAP_TILE_URL?.trim()
  return override ? { ...source, url: override, labelsUrl: undefined } : source
}
