export const inspectionResultOptions = ['سليم', 'ملاحظة', 'متضرر', 'مرشوش', 'مستبدل', 'غير معروف'] as const

/**
 * Photo categories, in two groups.
 *
 * The first five are the report body categories an inspector picks from when
 * documenting a section. The last four are the *pre-inspection* shots that the
 * field workflow makes mandatory before the checklist even unlocks — they are
 * separate because they answer a different question: not "what is the condition
 * of this car" but "was this inspector actually standing in front of it".
 *
 * Both groups live in one list because the storage column has a single CHECK
 * constraint; splitting them into two types would mean the upload route needed
 * two different validations for the same column.
 */
export const inspectionReportPhotoCategories = ['صور خارجية', 'صور داخلية', 'المحرك', 'الشاص', 'الإطارات'] as const

export const inspectionVerificationPhotoCategories = ['المركبة كاملة', 'لوحة المعرض', 'تقرير الفحص', 'لوحة العدادات'] as const

export const inspectionPhotoCategories = [
  ...inspectionReportPhotoCategories,
  ...inspectionVerificationPhotoCategories,
] as const

export const inspectionSections = [
  { id: 'exterior', title: 'الهيكل الخارجي', items: [
    { id: 'hood', label: 'غطاء المحرك' },
    { id: 'doors', label: 'الأبواب' },
    { id: 'bumpers', label: 'الصدامات' },
  ] },
  { id: 'engine', title: 'المحرك', items: [
    { id: 'start', label: 'تشغيل المحرك' },
    { id: 'leaks', label: 'التسريبات الظاهرة' },
    { id: 'sound-vibration', label: 'الأصوات والاهتزاز' },
  ] },
  { id: 'transmission', title: 'ناقل الحركة', items: [
    { id: 'gear-shifts', label: 'تبديل السرعات' },
    { id: 'visible-leak', label: 'التسريب الظاهر' },
    { id: 'response', label: 'استجابة ناقل الحركة' },
  ] },
  { id: 'electrical', title: 'الكهرباء', items: [
    { id: 'battery', label: 'البطارية' },
    { id: 'lights', label: 'الإنارة الخارجية' },
    { id: 'windows-locks', label: 'النوافذ والأقفال' },
  ] },
  { id: 'ac', title: 'المكيف', items: [
    { id: 'cooling', label: 'التبريد' },
    { id: 'airflow', label: 'مخارج الهواء' },
    { id: 'noise', label: 'أصوات نظام التكييف' },
  ] },
  { id: 'suspension', title: 'التعليق', items: [
    { id: 'response', label: 'استجابة نظام التعليق' },
    { id: 'driving-noise', label: 'الأصوات أثناء الحركة' },
    { id: 'shocks', label: 'المساعدات الظاهرة' },
  ] },
  { id: 'brakes', title: 'الفرامل', items: [
    { id: 'response', label: 'استجابة الفرامل' },
    { id: 'parking-brake', label: 'فرامل التوقف' },
    { id: 'indicators', label: 'المؤشرات الظاهرة' },
  ] },
  { id: 'tires', title: 'الإطارات', items: [
    { id: 'front-right', label: 'الإطار الأمامي الأيمن' },
    { id: 'front-left', label: 'الإطار الأمامي الأيسر' },
    { id: 'rear-tires', label: 'الإطارات الخلفية' },
  ] },
  { id: 'interior', title: 'المقصورة الداخلية', items: [
    { id: 'seats-belts', label: 'المقاعد والأحزمة' },
    { id: 'dashboard', label: 'لوحة العدادات' },
    { id: 'controls', label: 'مفاتيح التحكم' },
  ] },
  { id: 'chassis', title: 'الهيكل والشاص', items: [
    { id: 'repair-traces', label: 'آثار الإصلاح الظاهرة' },
    { id: 'frame-points', label: 'نقاط الشاص المرئية' },
    { id: 'rust', label: 'علامات الصدأ الظاهرة' },
  ] },
] as const

export type InspectionResult = typeof inspectionResultOptions[number]
export type InspectionChecklistKey = `${typeof inspectionSections[number]['id']}:${string}`

export type InspectionHealthScore = {
  score: number | null
  assessedItems: number
  excluded: {
    painted: number
    replaced: number
    unknown: number
  }
}

export type InspectionSectionHealth = {
  id: string
  title: string
  score: number | null
  assessedItems: number
}

export function computeInspectionHealthScore(checklist: Record<string, string>): InspectionHealthScore {
  let points = 0
  let assessedItems = 0
  const excluded = { painted: 0, replaced: 0, unknown: 0 }

  for (const result of Object.values(checklist)) {
    switch (result) {
      case 'سليم':
        points += 100
        assessedItems += 1
        break
      case 'ملاحظة':
        points += 50
        assessedItems += 1
        break
      case 'متضرر':
        assessedItems += 1
        break
      case 'مرشوش':
        excluded.painted += 1
        break
      case 'مستبدل':
        excluded.replaced += 1
        break
      case 'غير معروف':
        excluded.unknown += 1
        break
    }
  }

  return {
    score: assessedItems === 0 ? null : Math.round(points / assessedItems),
    assessedItems,
    excluded,
  }
}

export function computeInspectionSectionHealth(checklist: Record<string, string>): InspectionSectionHealth[] {
  return inspectionSections.map((section) => {
    const results: Record<string, string> = {}
    for (const item of section.items) {
      const key = `${section.id}:${item.id}`
      if (typeof checklist[key] === 'string') results[key] = checklist[key]
    }
    const health = computeInspectionHealthScore(results)
    return {
      id: section.id,
      title: section.title,
      score: health.score,
      assessedItems: health.assessedItems,
    }
  })
}

export const expectedChecklistKeys = inspectionSections.flatMap((section) =>
  section.items.map((item) => `${section.id}:${item.id}`),
)
