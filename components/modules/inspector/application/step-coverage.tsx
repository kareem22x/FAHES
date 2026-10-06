'use client'

import { MapPin, Wrench } from 'lucide-react'
import {
  CardMultiSelect,
  ChipGroup,
  ChoiceGroup,
  FormField,
  fieldClassName,
} from '@/components/modules/inspector/application/fields'
import { NOTES_MAX, type InspectorApplicationDraft } from '@/lib/inspector-application'
import { saudiCityOptions } from '@/lib/locations/saudi-cities'
import { inspectorAvailabilities, inspectorSpecialties } from '@/types/domain'

/**
 * Step 2 — where and how the applicant can work.
 *
 * These answers are not decoration: approving an application copies `cities`
 * onto the inspector's profile as their coverage area
 * (`setInspectorStatus` in `lib/user-store.ts`), which is what decides which
 * inspection requests reach them.
 */
export function CoverageStep({
  draft,
  onChange,
  onToggle,
}: {
  draft: InspectorApplicationDraft
  onChange: (patch: Partial<InspectorApplicationDraft>) => void
  onToggle: (field: 'cities' | 'specialties', value: string) => void
}) {
  return (
    <div className="mt-8 space-y-7">
      <ChipGroup
        legend="في أي مدن تقدر تفحص؟"
        hint="العمل متاح حاليًا في مدن المنطقة الشرقية؛ المدن الأخرى ستُفعّل عند توسّع التغطية."
        selected={draft.cities}
        options={saudiCityOptions.map((option) => ({
          value: option.name,
          label: option.name,
          disabled: !option.serviceable,
        }))}
        onToggle={(value) => onToggle('cities', value)}
        disabledHint="قريبًا"
      />

      <CardMultiSelect
        legend="وش مجالات الفحص اللي تتقنها؟"
        selected={draft.specialties}
        options={inspectorSpecialties}
        onToggle={(value) => onToggle('specialties', value)}
      />

      <ChoiceGroup
        legend="وش نوع التوفر المناسب لك؟"
        value={draft.availability || null}
        options={inspectorAvailabilities.map((availability) => ({
          value: availability,
          label: availability,
        }))}
        onChange={(next) => onChange({ availability: next })}
      />

      <ChoiceGroup
        legend="هل تتوفر لديك معدات الفحص الأساسية؟"
        value={draft.hasEquipment}
        options={[
          { value: true, label: 'نعم، متوفرة' },
          { value: false, label: 'لا، أحتاج إلى تجهيزها' },
        ]}
        columns={2}
        onChange={(next) => onChange({ hasEquipment: next })}
      />

      <FormField label="أي معلومات إضافية تحب نعرفها؟" optional>
        <textarea
          className={fieldClassName}
          rows={4}
          maxLength={NOTES_MAX}
          value={draft.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="اكتب نبذة مختصرة عن خبرتك أو أي تفاصيل تساعدنا في مراجعة طلبك."
        />
        <span className="mt-1 block text-left text-xs font-normal text-[#78879a]">
          {draft.notes.length}/{NOTES_MAX}
        </span>
      </FormField>

      <div className="flex flex-wrap gap-4 rounded-2xl border border-[#e4eaf1] bg-[#f7f9fc] px-5 py-4 text-xs font-semibold text-[#52647a]">
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5 text-[#0873d1]" />
          {draft.cities.length > 0 ? `${draft.cities.length} مدينة مختارة` : 'لم تختر مدنًا بعد'}
        </span>
        <span className="flex items-center gap-1.5">
          <Wrench className="size-3.5 text-[#0873d1]" />
          {draft.specialties.length > 0 ? `${draft.specialties.length} مجال مختار` : 'لم تختر مجالات بعد'}
        </span>
      </div>
    </div>
  )
}
