export const inspectionResultOptions = ['سليم', 'ملاحظة', 'متضرر', 'مرشوش', 'مستبدل', 'غير معروف'] as const
export const inspectionPhotoCategories = ['صور خارجية', 'صور داخلية', 'المحرك', 'الشاص', 'الإطارات'] as const

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

export const expectedChecklistKeys = inspectionSections.flatMap((section) =>
  section.items.map((item) => `${section.id}:${item.id}`),
)
