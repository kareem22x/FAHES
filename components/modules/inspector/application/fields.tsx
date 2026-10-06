'use client'

import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

/**
 * The form primitives shared by both application steps.
 *
 * Extracted so step 1 and step 2 cannot drift apart visually: a chip in the
 * city picker and a chip in the specialty picker are the same component with
 * the same hit area and the same selected state.
 */

export const fieldClassName =
  'mt-2 w-full rounded-xl border border-[#dce4ee] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#0873d1] focus:ring-4 focus:ring-[#0873d1]/10'

/** A labelled field, with an explicit «اختياري» badge when it may be skipped. */
export function FormField({
  label,
  hint,
  optional = false,
  children,
}: {
  label: string
  hint?: ReactNode
  optional?: boolean
  children: ReactNode
}) {
  return (
    <label className="block text-sm font-bold">
      {label}{' '}
      {optional ? (
        <span className="font-normal text-[#78879a]">(اختياري)</span>
      ) : (
        <span className="text-[#0873d1]">*</span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal leading-6 text-[#78879a]">{hint}</span>}
    </label>
  )
}

/**
 * Single-choice buttons.
 *
 * `value` is `string | boolean`, so the same component serves the availability
 * question and the yes/no questions without a second implementation.
 */
export function ChoiceGroup<T extends string | boolean>({
  legend,
  hint,
  value,
  options,
  columns = 3,
  onChange,
}: {
  legend: string
  hint?: string
  value: T | null
  options: readonly { value: T; label: string }[]
  columns?: 2 | 3
  onChange: (next: T) => void
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold">
        {legend} <span className="text-[#0873d1]">*</span>
      </legend>
      {hint && <p className="mt-1 text-xs leading-6 text-[#78879a]">{hint}</p>}
      <div className={`mt-3 grid gap-2 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {options.map((option) => {
          const selected = value === option.value
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                selected
                  ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]'
                  : 'border-[#e4eaf1] bg-white text-[#52647a] hover:border-[#9cc9f1]'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Multi-select chips. Used for cities, specialties, and the optional certificate answer. */
export function ChipGroup({
  legend,
  hint,
  selected,
  options,
  onToggle,
  disabledHint,
  required = true,
}: {
  legend: string
  hint?: string
  selected: string[]
  options: readonly { value: string; label: string; disabled?: boolean }[]
  onToggle: (value: string) => void
  disabledHint?: string
  /** `false` renders «(اختياري)» instead of the required asterisk. */
  required?: boolean
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold">
        {legend}{' '}
        {required ? (
          <span className="text-[#0873d1]">*</span>
        ) : (
          <span className="font-normal text-[#78879a]">(اختياري)</span>
        )}
      </legend>
      {hint && <p className="mt-1 text-xs leading-6 text-[#78879a]">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              disabled={option.disabled}
              onClick={() => onToggle(option.value)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition ${
                isSelected
                  ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]'
                  : option.disabled
                    ? 'cursor-not-allowed border-[#edf1f5] bg-[#f7f9fc] text-[#98a3b2]'
                    : 'border-[#e4eaf1] bg-white text-[#52647a] hover:border-[#9cc9f1]'
              }`}
            >
              {option.label}
              {option.disabled && disabledHint && <span className="font-normal">{disabledHint}</span>}
              {isSelected && <Check className="size-3.5" />}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Multi-select cards, used where each option needs a full-width row. */
export function CardMultiSelect({
  legend,
  selected,
  options,
  onToggle,
}: {
  legend: string
  selected: string[]
  options: readonly string[]
  onToggle: (value: string) => void
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold">
        {legend} <span className="text-[#0873d1]">*</span>
      </legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const isSelected = selected.includes(option)
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(option)}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-right text-sm font-semibold transition ${
                isSelected
                  ? 'border-[#0873d1] bg-[#eff7ff] text-[#075cae]'
                  : 'border-[#e4eaf1] bg-white text-[#52647a] hover:border-[#9cc9f1]'
              }`}
            >
              {option}
              {isSelected && <Check className="size-4 shrink-0" />}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
