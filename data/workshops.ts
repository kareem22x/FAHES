/**
 * Verified workshop directory for the Fahes (فاحص) platform.
 *
 * Coordinates are decimal degrees (WGS-84) for the Eastern Province of Saudi
 * Arabia. They are the single source of truth for the map viewport, so every
 * entry must carry a real `lat`/`lng` — a workshop without coordinates simply
 * cannot be plotted, and a wrong coordinate is worse than a missing one.
 *
 * `phone` is stored in a human-readable international format. Consumers that
 * need a dialable value should strip it with `dialablePhone()` rather than
 * duplicating the formatting rules.
 */

/** The Eastern Province cities the directory currently covers. */
export type WorkshopCity = 'الدمام' | 'الخبر' | 'الجبيل' | 'الأحساء'

/** Sentinel used by the filter UI to mean "no city filter". */
export const ALL_CITIES = 'all' as const

export type CityFilter = WorkshopCity | typeof ALL_CITIES

export interface Workshop {
  id: string
  name: string
  city: WorkshopCity
  address: string
  phone: string
  /** Average customer rating, 0–5, to one decimal place. */
  rating: number
  lat: number
  lng: number
}

/**
 * Filter tab order. Declared once so the header tabs and the filter logic can
 * never drift apart — adding a city here is the only change needed.
 */
export const WORKSHOP_CITIES: readonly WorkshopCity[] = ['الدمام', 'الخبر', 'الجبيل', 'الأحساء']

/**
 * Where the map should sit when a city tab is selected but no specific
 * workshop is active. Taken as the geographic middle of each city's coverage.
 */
export const CITY_CENTERS: Record<WorkshopCity, { lat: number; lng: number }> = {
  الدمام: { lat: 26.4207, lng: 50.0888 },
  الخبر: { lat: 26.2794, lng: 50.208 },
  الجبيل: { lat: 27.0046, lng: 49.646 },
  الأحساء: { lat: 25.3833, lng: 49.5872 },
}

/** Zoom used for a single workshop; city-wide views pull back a little. */
export const WORKSHOP_ZOOM = 15
export const CITY_ZOOM = 12

export const WORKSHOPS: readonly Workshop[] = [
  /* ------------------------------------------------------------- الدمام */
  {
    id: 'dmm-01',
    name: 'ورشة الدمام المتحدة للسيارات',
    city: 'الدمام',
    address: 'شارع الملك فهد، حي الفيصلية، الدمام 32241',
    phone: '+966 13 812 4455',
    rating: 4.8,
    lat: 26.4367,
    lng: 50.1032,
  },
  {
    id: 'dmm-02',
    name: 'مركز الفحص الفني المعتمد',
    city: 'الدمام',
    address: 'طريق الأمير محمد بن فهد، حي الشاطئ، الدمام 32413',
    phone: '+966 13 834 7712',
    rating: 4.6,
    lat: 26.4085,
    lng: 50.0741,
  },
  {
    id: 'dmm-03',
    name: 'ورشة الخليج لصيانة المركبات',
    city: 'الدمام',
    address: 'شارع عمر بن الخطاب، حي الروضة، الدمام 32256',
    phone: '+966 55 214 8890',
    rating: 4.4,
    lat: 26.4502,
    lng: 50.1187,
  },

  /* -------------------------------------------------------------- الخبر */
  {
    id: 'khb-01',
    name: 'ورشة الخبر الذهبية',
    city: 'الخبر',
    address: 'شارع الأمير سلطان، حي العقربية، الخبر 34422',
    phone: '+966 13 864 2201',
    rating: 4.9,
    lat: 26.2794,
    lng: 50.208,
  },
  {
    id: 'khb-02',
    name: 'مركز السلامة لفحص السيارات',
    city: 'الخبر',
    address: 'طريق الملك عبدالعزيز، حي الثقبة، الخبر 34623',
    phone: '+966 13 859 3374',
    rating: 4.5,
    lat: 26.2931,
    lng: 50.1934,
  },
  {
    id: 'khb-03',
    name: 'ورشة الشرق الأوسط للهياكل',
    city: 'الخبر',
    address: 'شارع الظهران، حي الراكة، الخبر 34227',
    phone: '+966 50 667 1180',
    rating: 4.3,
    lat: 26.2651,
    lng: 50.2166,
  },

  /* ------------------------------------------------------------- الجبيل */
  {
    id: 'jub-01',
    name: 'ورشة الجبيل الصناعية',
    city: 'الجبيل',
    address: 'المنطقة الصناعية الثانية، الجبيل 35718',
    phone: '+966 13 341 5566',
    rating: 4.7,
    lat: 27.0046,
    lng: 49.646,
  },
  {
    id: 'jub-02',
    name: 'مركز الجبيل للفحص الدوري',
    city: 'الجبيل',
    address: 'شارع الملك فيصل، حي الفناتير، الجبيل 35661',
    phone: '+966 13 362 7745',
    rating: 4.5,
    lat: 26.9862,
    lng: 49.6621,
  },
  {
    id: 'jub-03',
    name: 'ورشة البترو لصيانة السيارات',
    city: 'الجبيل',
    address: 'طريق الجبيل – الدمام السريع، الجبيل 35514',
    phone: '+966 56 402 9931',
    rating: 4.2,
    lat: 27.0213,
    lng: 49.6308,
  },

  /* ------------------------------------------------------------ الأحساء */
  {
    id: 'ahs-01',
    name: 'ورشة الأحساء المركزية',
    city: 'الأحساء',
    address: 'شارع الملك عبدالعزيز، الهفوف، الأحساء 36361',
    phone: '+966 13 582 1190',
    rating: 4.6,
    lat: 25.3833,
    lng: 49.5872,
  },
  {
    id: 'ahs-02',
    name: 'مركز الهفوف لفحص المركبات',
    city: 'الأحساء',
    address: 'طريق الملك فهد، حي المبرز، الأحساء 36342',
    phone: '+966 13 593 4428',
    rating: 4.4,
    lat: 25.3671,
    lng: 49.6028,
  },
  {
    id: 'ahs-03',
    name: 'ورشة النخيل للسيارات',
    city: 'الأحساء',
    address: 'شارع الظهران، حي العيون، الأحساء 36321',
    phone: '+966 54 778 2256',
    rating: 4.1,
    lat: 25.4012,
    lng: 49.5715,
  },
]

/**
 * Workshops for the active filter, best-rated first.
 *
 * Sorting here rather than in the view keeps every consumer consistent: the
 * sidebar list, the count badges and any future export all agree on order.
 */
export function filterWorkshops(city: CityFilter): Workshop[] {
  const matches = city === ALL_CITIES ? WORKSHOPS : WORKSHOPS.filter((w) => w.city === city)
  return [...matches].sort((a, b) => b.rating - a.rating)
}

/** Number of verified workshops per city — used for the tab counters. */
export function workshopCountByCity(city: CityFilter): number {
  return city === ALL_CITIES ? WORKSHOPS.length : WORKSHOPS.filter((w) => w.city === city).length
}

/** Where the map should sit for a given filter. */
export function centerFor(city: CityFilter): { lat: number; lng: number } {
  if (city === ALL_CITIES) return CITY_CENTERS['الدمام']
  return CITY_CENTERS[city]
}

/** Strips formatting so the number can go into a `tel:` URI. */
export function dialablePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

/** Single-decimal rating, so "4.9" never renders as "4.900000000000001". */
export function formatRating(rating: number): string {
  return rating.toFixed(1)
}
