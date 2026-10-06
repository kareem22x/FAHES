'use client'

import type { InspectorApplicationDraft } from '@/lib/inspector-application'

/**
 * The read-back shown before the applicant commits.
 *
 * Every value the admin will see is rendered here, including the ones the
 * applicant may have skipped — «لم تُجب» is stated rather than left blank, so
 * nobody submits an empty field believing it was filled.
 */

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-[#78879a]">{label}</dt>
      <dd className="font-semibold" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  )
}

function experienceLabel(years: string): string {
  if (years === '') return 'لم تُحدَّد'
  const value = Number(years)
  if (value === 0) return 'أقل من سنة'
  if (value >= 31) return 'أكثر من 30 سنة'
  return `${value} سنة`
}

export function ApplicationReview({ draft }: { draft: InspectorApplicationDraft }) {
  return (
    <div className="mt-8 space-y-5">
      <div className="rounded-xl border border-[#dce8f4] bg-[#f7f9fc] p-5 text-sm">
        <h3 className="font-black text-[#0b1f46]">البيانات الشخصية</h3>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Row label="الاسم الثلاثي" value={draft.fullName || '—'} />
          <Row label="رقم الهوية" value={draft.nationalId || '—'} ltr />
          <Row label="رقم الجوال" value={draft.phone || '—'} ltr />
          <Row label="العمر" value={draft.age ? `${draft.age} سنة` : '—'} />
        </dl>
      </div>

      <div className="rounded-xl border border-[#dce8f4] bg-[#f7f9fc] p-5 text-sm">
        <h3 className="font-black text-[#0b1f46]">الخبرات والشهادات</h3>
        <dl className="mt-3 space-y-3">
          <Row label="سنوات الخبرة" value={experienceLabel(draft.experienceYears)} />
          <Row label="وصف الخبرة" value={draft.experienceDetails || '—'} />
          <Row
            label="الشهادات"
            value={
              draft.hasCertificates === null
                ? 'لم تُجب'
                : draft.hasCertificates
                  ? draft.qualification || 'نعم — بدون تفاصيل'
                  : 'لا توجد'
            }
          />
        </dl>
      </div>

      <div className="rounded-xl border border-[#dce8f4] bg-[#f7f9fc] p-5 text-sm">
        <h3 className="font-black text-[#0b1f46]">التغطية والتوفر</h3>
        <dl className="mt-3 space-y-3">
          <Row label="مدن التغطية" value={draft.cities.join('، ') || '—'} />
          <Row label="مجالات الفحص" value={draft.specialties.join('، ') || '—'} />
          <Row label="نوع التوفر" value={draft.availability || '—'} />
          <Row
            label="معدات الفحص"
            value={draft.hasEquipment === null ? '—' : draft.hasEquipment ? 'متوفرة' : 'غير متوفرة'}
          />
          {draft.notes.trim() && <Row label="معلومات إضافية" value={draft.notes} />}
        </dl>
      </div>

      <p className="text-xs leading-6 text-[#78879a]">
        بالضغط على «إرسال طلب الانضمام» أنت توافق على مراجعة بياناتك وتفعيل حسابك كفاحص بعد
        الموافقة. تُراجع الطلبات من فريق المنصة، ونتواصل معك على رقم الجوال المسجّل.
      </p>
    </div>
  )
}
