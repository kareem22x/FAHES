import { describe, expect, it } from 'vitest'
import {
  COMING_SOON_CITIES,
  SUPPORTED_CITIES,
  easternProvinceCities,
  easternProvinceCityProfiles,
  isComingSoonCity,
  isOperationalCity,
  saudiCityOptions,
} from '@/lib/locations/saudi-cities'

describe('supported coverage', () => {
  it('serves exactly the five launched cities, in prominence order', () => {
    expect([...SUPPORTED_CITIES]).toEqual(['الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء'])
  })

  it('treats every other city as out of coverage', () => {
    for (const city of SUPPORTED_CITIES) expect(isOperationalCity(city)).toBe(true)

    // Coming-soon Eastern Province cities are still *not* serviceable…
    for (const city of ['الظهران', 'رأس تنورة', 'سيهات', 'صفوى', 'جزيرة تاروت', 'عنك', 'حفر الباطن', 'الخفجي']) {
      expect(isOperationalCity(city)).toBe(false)
      expect(isComingSoonCity(city)).toBe(true)
    }

    // …and neither are cities in other regions.
    expect(isOperationalCity('الرياض')).toBe(false)
    expect(isComingSoonCity('الرياض')).toBe(false)
  })
})

describe('eastern province display list', () => {
  it('lists supported cities first, then coming-soon ones', () => {
    expect(easternProvinceCities.slice(0, SUPPORTED_CITIES.length)).toEqual([...SUPPORTED_CITIES])
    expect(easternProvinceCities.slice(SUPPORTED_CITIES.length)).toEqual([...COMING_SOON_CITIES])
  })

  it('contains each city exactly once', () => {
    expect(new Set(easternProvinceCities).size).toBe(easternProvinceCities.length)
    expect(easternProvinceCities.length).toBe(SUPPORTED_CITIES.length + COMING_SOON_CITIES.length)
  })

  /**
   * حرس الانحدار على العطل الذي أنتج «الطلب خارج مدن عملك».
   *
   * كان `/api/inspectors/profile` و`/api/inspectors/apply` والقائمة في لوحة
   * الفاحص تتحقّق كلها على `easternProvinceCities` (19 مدينة) بدل
   * `SUPPORTED_CITIES` (5). فأمكن حفظ مدينة «قريبًا» في `inspector_cities`،
   * وهي مدينة **لا يُنشأ فيها طلب أبدًا** لأن `/api/inspections` يرفض غير
   * المدن الخمس بـ`isOperationalCity`.
   *
   * النتيجة: فاحص محفوظ بمدن لا يصله منها طلب، وأي عرض يُرفض.
   *
   * الاختبار لا يفحص الملفات (لا يمكنه) بل يثبّت **الفرضية** التي اعتمدها
   * الإصلاح: القائمتان مختلفتان، والقائمة الكاملة تحتوي مدنًا غير صالحة
   * للتخويل. فإن أُضيفت مدينة «قريبًا» جديدة بقي الحرس صالحًا؛ وإن دُمجت
   * القائمتان يومًا فسيسقط هذا الاختبار ويُنبّهنا قبل أن يسقط فاحص حقيقي.
   */
  it('keeps the display list wider than the authorisation list', () => {
    expect(easternProvinceCities.length).toBeGreaterThan(SUPPORTED_CITIES.length)

    const displayOnly = easternProvinceCities.filter((city) => !isOperationalCity(city))
    expect(displayOnly.length).toBe(COMING_SOON_CITIES.length)

    // كل مدينة في قائمة العرض وليست مدعومة ⇒ مرفوضة للتخويل بالضبط.
    for (const city of displayOnly) expect(isOperationalCity(city)).toBe(false)
  })
})

describe('select options', () => {
  it('keeps major cities visible but outside active service coverage', () => {
    expect(saudiCityOptions.find((city) => city.name === 'الرياض')).toMatchObject({
      region: 'مدن المملكة الأخرى',
      serviceable: false,
      group: 'other',
    })
  })

  it('marks coming-soon cities as in-region but unselectable', () => {
    // The group matters: these must not fall into the "other regions" optgroup.
    expect(saudiCityOptions.find((city) => city.name === 'الظهران')).toMatchObject({
      region: 'المنطقة الشرقية',
      serviceable: false,
      group: 'eastern-soon',
    })
  })

  it('marks the launched cities as the only selectable ones', () => {
    const selectable = saudiCityOptions.filter((city) => city.serviceable).map((city) => city.name)
    expect(selectable).toEqual([...SUPPORTED_CITIES])
  })

  it('accounts for every Eastern Province city in the two eastern groups', () => {
    const eastern = saudiCityOptions
      .filter((city) => city.group === 'eastern-active' || city.group === 'eastern-soon')
      .map((city) => city.name)
    expect(eastern).toEqual([...easternProvinceCities])
  })
})

describe('city profiles', () => {
  it('agrees with the authorisation list — no drift between the two', () => {
    // This is the invariant that keeps the coverage section honest: a profile
    // can never claim to be supported while the API would reject the booking.
    for (const profile of easternProvinceCityProfiles) {
      expect(profile.supported, `${profile.name} profile flag`).toBe(isOperationalCity(profile.name))
    }
  })

  it('covers every Eastern Province city exactly once', () => {
    expect(easternProvinceCityProfiles.map((city) => city.name).sort()).toEqual(
      [...easternProvinceCities].sort(),
    )
  })

  it('puts the supported cities at the front so the carousel opens on them', () => {
    const supported = easternProvinceCityProfiles.filter((city) => city.supported)
    expect(supported.map((city) => city.name)).toEqual([...SUPPORTED_CITIES])
    expect(easternProvinceCityProfiles.slice(0, supported.length).every((city) => city.supported)).toBe(true)
  })
})
