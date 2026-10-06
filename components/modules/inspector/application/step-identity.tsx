'use client'

import { GraduationCap, IdCard, Phone, User } from 'lucide-react'
import { ChipGroup, FormField, fieldClassName } from '@/components/modules/inspector/application/fields'
import {
  AGE_MAX,
  AGE_MIN,
  CERTIFICATE_MAX,
  EXPERIENCE_DETAILS_MAX,
  EXPERIENCE_YEARS_MAX,
  FULL_NAME_MAX,
  type InspectorApplicationDraft,
} from '@/lib/inspector-application'

const CERTIFICATE_ANSWERS = [
  { value: true, label: 'نعم، لديّ شهادات' },
  { value: false, label: 'لا توجد' },
] as const

/**
 * Step 1 — who the applicant is.
 *
 * Every field here is required except the certificate question, which is
 * explicitly optional: the applicant may answer «نعم» / «لا», or skip it
 * entirely. Skipping stores `null`, not `false` — see `hasCertificates` in
 * `types/domain.ts`.
 *
 * `showPhone` exists for the sign-up wizard, which creates the Clerk account in
 * the same breath and therefore collects the number in its own account step.
 * The field still binds to `draft.phone`, so the submitted payload is identical
 * either way — only the on-screen placement differs.
 */
export function IdentityStep({
  draft,
  onChange,
  showPhone = true,
}: {
  draft: InspectorApplicationDraft
  onChange: (patch: Partial<InspectorApplicationDraft>) => void
  showPhone?: boolean
}) {
  return (
    <div className="mt-8 space-y-7">
      <FormField label="الاسم الثلاثي الكامل" hint="اكتب اسمك كما في الهوية — ثلاث كلمات على الأقل.">
        <input
          className={fieldClassName}
          value={draft.fullName}
          onChange={(event) => onChange({ fullName: event.target.value })}
          placeholder="مثال: محمد عبدالله القحطاني"
          maxLength={FULL_NAME_MAX}
          autoComplete="name"
        />
      </FormField>

      <FormField
        label="رقم الهوية"
        hint="10 أرقام — يبدأ بـ 1 للسعوديين أو 2 للمقيمين."
      >
        <input
          className={`${fieldClassName} text-center font-mono tracking-[0.2em]`}
          dir="ltr"
          inputMode="numeric"
          maxLength={10}
          value={draft.nationalId}
          onChange={(event) => onChange({ nationalId: event.target.value.replace(/\D/g, '') })}
          placeholder="1XXXXXXXXX"
        />
      </FormField>

      {showPhone && (
        <FormField label="رقم الجوال" hint="يبدأ بـ 05 ويتكون من 10 أرقام — سنتواصل معك عليه.">
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 rounded-xl border border-[#dce4ee] bg-[#f7f9fc] px-3 py-3 text-sm font-bold text-[#52647a]">
              <Phone className="inline size-4" />
            </span>
            <input
              className={`${fieldClassName} mt-0 text-center font-mono tracking-[0.15em]`}
              dir="ltr"
              inputMode="numeric"
              maxLength={10}
              value={draft.phone}
              onChange={(event) => onChange({ phone: event.target.value.replace(/\D/g, '').slice(0, 10) })}
              placeholder="05XXXXXXXX"
              autoComplete="tel"
            />
          </div>
        </FormField>
      )}

      <FormField label="العمر" hint={`من ${AGE_MIN} إلى ${AGE_MAX} سنة.`}>
        <input
          className={`${fieldClassName} text-center font-mono`}
          dir="ltr"
          inputMode="numeric"
          maxLength={2}
          value={draft.age}
          onChange={(event) => onChange({ age: event.target.value.replace(/\D/g, '').slice(0, 2) })}
          placeholder="30"
        />
      </FormField>

      <div className="rounded-2xl border border-[#e4eaf1] bg-[#f7f9fc] p-5">
        <p className="flex items-center gap-2 text-sm font-black text-[#0b1f46]">
          <User className="size-4 text-[#0873d1]" /> الخبرات
        </p>

        <div className="mt-4 space-y-6">
          <FormField label="عدد سنوات الخبرة في فحص السيارات">
            <select
              className={fieldClassName}
              value={draft.experienceYears}
              onChange={(event) => onChange({ experienceYears: event.target.value })}
            >
              <option value="" disabled>
                اختر عدد السنوات
              </option>
              {Array.from({ length: EXPERIENCE_YEARS_MAX }, (_, years) => (
                <option key={years} value={years}>
                  {years === 0 ? 'أقل من سنة' : `${years} ${years === 1 ? 'سنة' : 'سنوات'}`}
                </option>
              ))}
              <option value={EXPERIENCE_YEARS_MAX}>أكثر من 30 سنة</option>
            </select>
          </FormField>

          <FormField
            label="وصف الخبرة"
            hint="اذكر أين عملت وما الذي تتقنه — يساعدنا في مراجعة طلبك."
          >
            <textarea
              className={fieldClassName}
              rows={4}
              maxLength={EXPERIENCE_DETAILS_MAX}
              value={draft.experienceDetails}
              onChange={(event) => onChange({ experienceDetails: event.target.value })}
              placeholder="مثال: 7 سنوات في فحص المحرك وناقل الحركة بورشة معتمدة في الدمام."
            />
            <span className="mt-1 block text-left text-xs font-normal text-[#78879a]">
              {draft.experienceDetails.length}/{EXPERIENCE_DETAILS_MAX}
            </span>
          </FormField>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e4eaf1] bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-black text-[#0b1f46]">
          <GraduationCap className="size-4 text-[#0873d1]" /> الشهادات
          <span className="font-normal text-[#78879a]">(اختياري)</span>
        </p>
        <p className="mt-1 text-xs leading-6 text-[#78879a]">
          هل لديك شهادات أو دورات ذات صلة؟ يمكنك تخطّي هذا السؤال.
        </p>

        <div className="mt-4">
          <ChipGroup
            legend="هل لديك شهادات؟"
            required={false}
            selected={draft.hasCertificates === null ? [] : [String(draft.hasCertificates)]}
            options={CERTIFICATE_ANSWERS.map((answer) => ({
              value: String(answer.value),
              label: answer.label,
            }))}
            onToggle={(value) => {
              const next = value === 'true'
              // Un-tapping the current answer returns the question to "not
              // answered" — the only way back to the optional state.
              onChange({
                hasCertificates: draft.hasCertificates === next ? null : next,
                ...(draft.hasCertificates === next ? { qualification: '' } : {}),
              })
            }}
          />
          <p className="mt-2 text-xs text-[#78879a]">
            {draft.hasCertificates === null
              ? 'لم تُجب على هذا السؤال — يمكنك المتابعة.'
              : draft.hasCertificates
                ? 'اذكر أسماء الشهادات أدناه.'
                : 'لا توجد شهادات — يمكنك المتابعة.'}
          </p>
        </div>

        {draft.hasCertificates === true && (
          <div className="mt-5">
            <FormField label="أسماء الشهادات أو الدورات" optional>
              <input
                className={fieldClassName}
                maxLength={CERTIFICATE_MAX}
                value={draft.qualification}
                onChange={(event) => onChange({ qualification: event.target.value })}
                placeholder="مثال: شهادة فحص مركبات أو دورة ميكانيكا"
              />
            </FormField>
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-xs text-[#98a3b2]">
          <IdCard className="size-3.5" />
          تُراجع الشهادات يدويًا عند الاعتماد.
        </p>
      </div>
    </div>
  )
}
