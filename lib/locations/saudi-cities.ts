/**
 * City coverage model.
 *
 * ── Two lists, one source of truth ──────────────────────────────────────────
 *
 * `SUPPORTED_CITIES` is the *only* set we dispatch inspectors to. Everything
 * else is either "coming soon" (an Eastern Province city we have queued but do
 * not serve yet) or outside the region entirely. The server validates against
 * this list, so the UI and the API can never disagree about coverage — which is
 * the failure mode that produces "the site said you cover الظهران but the form
 * rejected it".
 *
 * `easternProvinceCities` stays the full display list (supported first, then
 * coming-soon) because it is what the coverage section and the region filter
 * render. Do not use it for authorisation — use `isOperationalCity`.
 */

/** Cities with inspectors on the ground today. Order = prominence in the UI. */
export const SUPPORTED_CITIES = [
  'الدمام',
  'الخبر',
  'الجبيل',
  'القطيف',
  'الأحساء',
] as const

/**
 * Eastern Province cities we have queued but do not cover yet. They stay
 * visible so visitors can see what is coming, but they are locked everywhere
 * a city can be chosen.
 */
export const COMING_SOON_CITIES = [
  'الظهران',
  'رأس تنورة',
  'سيهات',
  'صفوى',
  'جزيرة تاروت',
  'عنك',
  'الهفوف',
  'المبرز',
  'بقيق',
  'الخفجي',
  'حفر الباطن',
  'النعيرية',
  'قرية العليا',
  'العديد',
] as const

/** Full Eastern Province list, supported cities first. Display order only. */
export const easternProvinceCities: readonly string[] = [
  ...SUPPORTED_CITIES,
  ...COMING_SOON_CITIES,
]

export const saudiMajorCities: readonly string[] = [
  'الرياض',
  'جدة',
  'مكة المكرمة',
  'المدينة المنورة',
  'الطائف',
  'الخرج',
  'تبوك',
  'أبها',
  'خميس مشيط',
  'جازان',
  'نجران',
  'بريدة',
  'عنيزة',
  'حائل',
  'ينبع',
  'عرعر',
  'سكاكا',
]

/** Short badge shown on a locked city, in cards and in `<option>`s. */
export const COMING_SOON_LABEL = 'قريبًا'

/**
 * The message shown when someone tries to pick a city we do not cover yet.
 * Kept here so the card carousel, the selects and any future surface say the
 * exact same thing.
 */
export const COMING_SOON_MESSAGE =
  'الخدمة غير متوفرة في هذه المدينة حالياً، نعمل على تغطيتها قريباً'

export type SaudiCityRegion = 'المنطقة الشرقية' | 'مدن المملكة الأخرى'

/**
 * Which `<optgroup>` a city belongs to. `serviceable` alone is not enough now
 * that there are two *different* kinds of unserviceable city: a coming-soon
 * one in our own region, and one in a region we have never covered.
 */
export type SaudiCityGroup = 'eastern-active' | 'eastern-soon' | 'other'

export type SaudiCityOption = {
  name: string
  region: SaudiCityRegion
  serviceable: boolean
  group: SaudiCityGroup
}

export const saudiCityOptions: SaudiCityOption[] = [
  ...SUPPORTED_CITIES.map((name) => ({
    name,
    region: 'المنطقة الشرقية' as const,
    serviceable: true,
    group: 'eastern-active' as const,
  })),
  ...COMING_SOON_CITIES.map((name) => ({
    name,
    region: 'المنطقة الشرقية' as const,
    serviceable: false,
    group: 'eastern-soon' as const,
  })),
  ...saudiMajorCities.map((name) => ({
    name,
    region: 'مدن المملكة الأخرى' as const,
    serviceable: false,
    group: 'other' as const,
  })),
]

/**
 * The authorisation check. True only for the five cities we actually serve —
 * this is what `/api/inspections` uses to reject an out-of-coverage request.
 */
export function isOperationalCity(city: string): boolean {
  return (SUPPORTED_CITIES as readonly string[]).includes(city)
}

/** True for a city we intend to cover but have not launched yet. */
export function isComingSoonCity(city: string): boolean {
  return (COMING_SOON_CITIES as readonly string[]).includes(city)
}

/**
 * A city plus its best-known landmark. The landmark name is what the city is
 * recognised by, so the coverage section can show a real image and a caption
 * instead of only the city name. Images live in `public/cities/<slug>.webp`.
 */
export type CityProfile = {
  slug: string
  name: string
  landmark: string
  note: string
  image: string
  /** Mirrors `SUPPORTED_CITIES`. Locked profiles render greyed-out. */
  supported: boolean
}

/**
 * Profiles are ordered so the supported cities come first — the carousel opens
 * on the cities a visitor can actually book, and the locked ones trail behind
 * as visible-but-muted "coming soon" entries.
 */
export const easternProvinceCityProfiles: CityProfile[] = [
  { slug: 'dammam', name: 'الدمام', landmark: 'كورنيش الدمام', note: 'عاصمة المنطقة الشرقية وواجهتها البحرية', image: '/cities/dammam.webp', supported: true },
  { slug: 'khobar', name: 'الخبر', landmark: 'واجهة الخبر البحرية', note: 'أبراج الخليج وكورنيش الخبر', image: '/cities/khobar.webp', supported: true },
  { slug: 'jubail', name: 'الجبيل', landmark: 'واجهة الجبيل البحرية', note: 'مرسى حديث ومدينة صناعية', image: '/cities/jubail.webp', supported: true },
  { slug: 'qatif', name: 'القطيف', landmark: 'كورنيش القطيف', note: 'واجهة بحرية وميناء الصيادين', image: '/cities/qatif.webp', supported: true },
  { slug: 'al-ahsa', name: 'الأحساء', landmark: 'واحة الأحساء', note: 'واحة تاريخية مدرجة ضمن قائمة التراث العالمي', image: '/cities/hofuf.webp', supported: true },

  { slug: 'dhahran', name: 'الظهران', landmark: 'مركز إثراء', note: 'مركز الملك عبدالعزيز الثقافي العالمي', image: '/cities/dhahran.webp', supported: false },
  { slug: 'ras-tanura', name: 'رأس تنورة', landmark: 'ميناء رأس تنورة', note: 'أكبر منافذ تصدير النفط', image: '/cities/ras-tanura.webp', supported: false },
  { slug: 'saihat', name: 'سيهات', landmark: 'كورنيش سيهات', note: 'شاطئ هادئ وممشى على الخليج', image: '/cities/saihat.webp', supported: false },
  { slug: 'safwa', name: 'صفوى', landmark: 'بساتين صفوى', note: 'نخيل ممتد على ساحل الخليج', image: '/cities/safwa.webp', supported: false },
  { slug: 'tarout', name: 'جزيرة تاروت', landmark: 'قلعة تاروت', note: 'قلعة تاريخية وسط النخيل', image: '/cities/tarout.webp', supported: false },
  { slug: 'anak', name: 'عنك', landmark: 'بلدة عنك التاريخية', note: 'أزقة طينية وأبواب خشبية قديمة', image: '/cities/anak.webp', supported: false },
  { slug: 'hofuf', name: 'الهفوف', landmark: 'جبل القارة', note: 'كهوف الأحساء وواحتها', image: '/cities/hofuf.webp', supported: false },
  { slug: 'mubarraz', name: 'المبرز', landmark: 'قصر صاهود', note: 'قلعة طينية في قلب الأحساء', image: '/cities/mubarraz.webp', supported: false },
  { slug: 'buqayq', name: 'بقيق', landmark: 'منشآت بقيق', note: 'قلب صناعة النفط في الشرقية', image: '/cities/buqayq.webp', supported: false },
  { slug: 'khafji', name: 'الخفجي', landmark: 'كورنيش الخفجي', note: 'أقصى شمال الشرقية على الخليج', image: '/cities/khafji.webp', supported: false },
  { slug: 'hafr-al-batin', name: 'حفر الباطن', landmark: 'وادي الباطن', note: 'بوابة الشرقية الشمالية', image: '/cities/hafr-al-batin.webp', supported: false },
  { slug: 'nairyah', name: 'النعيرية', landmark: 'رمال النعيرية', note: 'كثبان وحقول تمتد بالصحراء', image: '/cities/nairyah.webp', supported: false },
  { slug: 'qaryat-al-ulya', name: 'قرية العليا', landmark: 'مزارع قرية العليا', note: 'رقعة خضراء وسط الصحراء', image: '/cities/qaryat-al-ulya.webp', supported: false },
  { slug: 'al-adeid', name: 'العديد', landmark: 'حقل العديد', note: 'حقل نفطي على الحدود الشرقية', image: '/cities/al-adeid.webp', supported: false },
]

/** Profiles of the cities we serve, in prominence order. */
export const supportedCityProfiles: CityProfile[] = easternProvinceCityProfiles.filter(
  (city) => city.supported,
)
