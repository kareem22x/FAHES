'use client'

/**
 * InspectionRequestForm — worked example of `SaudiPlateInput` inside a real
 * `react-hook-form` + `Zod` form.
 *
 * ── A note on "Radix UI" ────────────────────────────────────────────────────
 * The brief asked for a Radix UI form context. This project does **not** ship
 * Radix — it is on Base UI (`@base-ui/react`) and its own CSS primitives, and
 * its form screens (`components/modules/booking/new-request-wizard.tsx`) are
 * plain controlled markup. So this example matches the stack that actually
 * exists here rather than pulling in a second primitive library: `Controller`
 * binds the plate, native fields carry the rest, and the project's global
 * `input`/`select` styling supplies the look.
 *
 * ── What it demonstrates ────────────────────────────────────────────────────
 * 1. `saudiPlateSchema` validates the plate payload emitted by `onChange`.
 * 2. `Controller` wires that payload straight into RHF with no glue code.
 * 3. The live payload panel shows exactly the object the component emits.
 * 4. `fullPlate` drops into the app's existing `vehicle.plateNumber` field.
 */

import { useCallback, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'motion/react'
import { Car, CheckCircle2, LoaderCircle, RotateCcw, Send, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { SaudiPlateInput } from '@/components/ui/saudi-plate-input'
import { isOperationalCity, saudiCityOptions } from '@/lib/locations/saudi-cities'
import { cn } from '@/lib/utils'
import {
  EMPTY_SAUDI_PLATE,
  SAUDI_PLATE_EXCLUDED_LATIN_LETTERS,
  SAUDI_PLATE_LETTERS,
  SAUDI_PLATE_LETTER_COUNT,
  SAUDI_PLATE_NUMBER_MAX,
  isSaudiPlateLatinLetter,
  type SaudiPlateValue,
} from '@/lib/utils/plate-mapper'

/* ==========================================================================
   Validation
   ========================================================================== */

/**
 * Validates the exact object `SaudiPlateInput.onChange` emits:
 * 1–4 digits and exactly 3 of the 17 permitted Saudi plate letters.
 *
 * Exported so any screen that stores a plate — not just this form — can reuse
 * the same rules.
 */
export const saudiPlateSchema = z
  .object({
    numbers: z.string(),
    lettersEn: z.string(),
    lettersAr: z.string(),
    numbersAr: z.string(),
    fullPlate: z.string(),
  })
  .superRefine((plate, ctx) => {
    if (plate.numbers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['numbers'],
        message: 'أدخل رقم اللوحة.',
      })
    } else if (!new RegExp(`^\\d{1,${SAUDI_PLATE_NUMBER_MAX}}$`).test(plate.numbers)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['numbers'],
        message: `رقم اللوحة من ١ إلى ${SAUDI_PLATE_NUMBER_MAX} أرقام.`,
      })
    }

    if (plate.lettersEn.length !== SAUDI_PLATE_LETTER_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lettersEn'],
        message: `أدخل ${SAUDI_PLATE_LETTER_COUNT} حروف للوحة.`,
      })
    } else if (!Array.from(plate.lettersEn).every(isSaudiPlateLatinLetter)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lettersEn'],
        message: 'حروف اللوحة السعودية محصورة في ١٧ حرفًا معتمدًا.',
      })
    }
  })

export const inspectionRequestSchema = z.object({
  plate: saudiPlateSchema,
  city: z.string().min(1, { message: 'اختر مدينة الفحص.' }),
  district: z
    .string()
    .trim()
    .min(2, { message: 'أدخل اسم الحي أو المنطقة.' })
    .max(80, { message: 'اسم الحي طويل جدًا.' }),
  notes: z.string().trim().max(500, { message: 'الملاحظات تتجاوز ٥٠٠ حرف.' }),
  termsAccepted: z
    .boolean()
    .refine((accepted) => accepted === true, { message: 'يجب الموافقة على التعهد.' }),
})

export type InspectionRequestValues = z.infer<typeof inspectionRequestSchema>

/* ==========================================================================
   Helpers
   ========================================================================== */

/**
 * `saudiPlateSchema` reports issues at `plate.numbers` / `plate.lettersEn`, so
 * RHF hands back a nested error tree. Walk it and surface the first message —
 * robust to either the nested or the flattened shape.
 */
function firstErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null
  if (typeof error !== 'object') return null

  const candidate = error as { message?: unknown }
  if (typeof candidate.message === 'string' && candidate.message !== '') {
    return candidate.message
  }

  for (const nested of Object.values(error as Record<string, unknown>)) {
    const found = firstErrorMessage(nested)
    if (found) return found
  }
  return null
}

const FIELD_CLASS = cn(
  'w-full text-[15px] font-semibold',
  'aria-invalid:border-[#bf3b2c]! aria-invalid:ring-2 aria-invalid:ring-[#bf3b2c]/15',
)

const LABEL_CLASS = 'flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-[#1e3a8a]'

const HINT_CLASS =
  'rounded-full bg-[#f3f6fa] px-2 py-0.5 text-[11.5px] font-semibold text-[#7e8da0]'

const PANEL_CLASS =
  'rounded-[20px] border border-[#e2eaf4] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'

/* ==========================================================================
   Component
   ========================================================================== */

export function InspectionRequestForm({ className }: { className?: string }) {
  const [submitted, setSubmitted] = useState<InspectionRequestValues | null>(null)

  const form = useForm<InspectionRequestValues>({
    resolver: zodResolver(inspectionRequestSchema),
    mode: 'onTouched',
    defaultValues: {
      plate: { ...EMPTY_SAUDI_PLATE },
      city: '',
      district: '',
      notes: '',
      termsAccepted: false,
    },
  })

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = form

  // The exact payload the plate emits — rendered live on the side.
  // `useWatch` rather than `watch()`: it is a proper subscription hook, so the
  // React Compiler can still memoise this component.
  const platePreview = useWatch({ control, name: 'plate' }) ?? EMPTY_SAUDI_PLATE

  const onSubmit = handleSubmit(async (values) => {
    // Stand-in for POST /api/inspections.
    await new Promise((resolve) => setTimeout(resolve, 600))
    setSubmitted(values)
    toast.success('تم التحقق من اللوحة ونشر الطلب.')
  })

  const handleReset = useCallback(() => {
    setSubmitted(null)
    reset()
  }, [reset])

  const payloadRows = useMemo(
    () => [
      { key: 'numbers', value: platePreview.numbers, hint: 'أرقام ASCII' },
      { key: 'numbersAr', value: platePreview.numbersAr, hint: 'أرقام عربية' },
      { key: 'lettersEn', value: platePreview.lettersEn, hint: 'حروف لاتينية' },
      { key: 'lettersAr', value: platePreview.lettersAr, hint: 'حروف عربية' },
      { key: 'fullPlate', value: platePreview.fullPlate, hint: 'vehicle.plateNumber' },
    ],
    [platePreview],
  )

  return (
    <div className={cn('grid gap-6 lg:grid-cols-[1.4fr_1fr]', className)}>
      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <form onSubmit={onSubmit} noValidate className="grid content-start gap-5">
        {/* Plate */}
        <section className={PANEL_CLASS}>
          <header className="mb-4 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-[#eff6ff] text-[#2563eb]">
              <Car size={18} />
            </span>
            <div>
              <h2 className="text-[17px] font-extrabold text-[#0f172a]">لوحة السيارة</h2>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#5f7086]">
                اكتب الأرقام والحروف مباشرة على اللوحة، أو استخدم الحقول أسفلها.
              </p>
            </div>
          </header>

          <Controller
            control={control}
            name="plate"
            render={({ field, fieldState }) => (
              <SaudiPlateInput
                ref={field.ref}
                name={field.name}
                size="lg"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={field.disabled}
                invalid={fieldState.invalid}
                error={firstErrorMessage(fieldState.error)}
              />
            )}
          />

          {/* Legend: which letters the plate accepts. */}
          <details className="mt-4 rounded-[14px] border border-[#eef3f9] bg-[#fbfcfe] px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-bold text-[#1e3a8a]">
              الحروف المعتمدة على اللوحة السعودية ({SAUDI_PLATE_LETTERS.length})
            </summary>
            <ul className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {SAUDI_PLATE_LETTERS.map((letter) => (
                <li
                  key={letter.latin}
                  className="flex items-center justify-between gap-1 rounded-lg border border-[#e2eaf4] bg-white px-2 py-1"
                >
                  <span className="font-mono text-[13px] font-bold text-[#0f172a]">
                    {letter.latin}
                  </span>
                  <span className="text-[15px] font-bold text-[#0f7a55]">{letter.arabic}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-[#7e8da0]">
              الحروف غير المتاحة:{' '}
              <span className="font-mono font-bold" dir="ltr">
                {SAUDI_PLATE_EXCLUDED_LATIN_LETTERS.join(' ')}
              </span>
            </p>
          </details>
        </section>

        {/* Request details */}
        <section className={PANEL_CLASS}>
          <header className="mb-4">
            <h2 className="text-[17px] font-extrabold text-[#0f172a]">تفاصيل الطلب</h2>
            <p className="mt-0.5 text-[13px] text-[#5f7086]">
              التغطية متاحة حاليًا في مدن المنطقة الشرقية.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="irf-city" className={LABEL_CLASS}>
                المدينة
              </label>
              <select
                id="irf-city"
                aria-invalid={errors.city ? true : undefined}
                className={FIELD_CLASS}
                {...register('city', {
                  validate: (value) =>
                    isOperationalCity(value) || 'التغطية متاحة في مدن المنطقة الشرقية فقط.',
                })}
              >
                <option value="">اختر المدينة…</option>
                {saudiCityOptions.map((option) => (
                  <option key={option.name} value={option.name} disabled={!option.serviceable}>
                    {option.serviceable ? option.name : `${option.name} — قريبًا`}
                  </option>
                ))}
              </select>
              {errors.city ? (
                <p role="alert" className="text-[12.5px] font-semibold text-[#bf3b2c]">
                  {errors.city.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="irf-district" className={LABEL_CLASS}>
                الحي
              </label>
              <input
                id="irf-district"
                type="text"
                maxLength={80}
                placeholder="مثال: الفيصلية"
                aria-invalid={errors.district ? true : undefined}
                className={FIELD_CLASS}
                {...register('district')}
              />
              {errors.district ? (
                <p role="alert" className="text-[12.5px] font-semibold text-[#bf3b2c]">
                  {errors.district.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <label htmlFor="irf-notes" className={LABEL_CLASS}>
                ملاحظات
                <span className={HINT_CLASS}>اختياري</span>
              </label>
              <textarea
                id="irf-notes"
                rows={3}
                maxLength={500}
                placeholder="أي تفاصيل تساعد الفاحص على الوصول للسيارة"
                aria-invalid={errors.notes ? true : undefined}
                className={cn(FIELD_CLASS, 'resize-y')}
                {...register('notes')}
              />
            </div>
          </div>
        </section>

        {/* Consent */}
        <section className={PANEL_CLASS}>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 size-[19px] shrink-0 accent-[#2563eb]"
              {...register('termsAccepted')}
            />
            <span className="text-[13.5px] leading-relaxed text-[#1e3a8a]">
              <strong className="block text-[#0f172a]">أوافق على التعهد</strong>
              أقر بأن رقم اللوحة المدخل مطابق للوحة السيارة الفعلية.
            </span>
          </label>
          {errors.termsAccepted ? (
            <p role="alert" className="mt-2 text-[12.5px] font-semibold text-[#bf3b2c]">
              {errors.termsAccepted.message}
            </p>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {isSubmitting ? 'جارٍ التحقق' : 'إرسال الطلب'}
          </button>
          <button type="button" onClick={handleReset} className="btn btn-ghost btn-sm">
            <RotateCcw size={15} /> تفريغ النموذج
          </button>
          {Object.keys(errors).length > 0 ? (
            <span className="text-[12.5px] font-semibold text-[#bf3b2c]">
              راجع الحقول المعلّمة بالأحمر.
            </span>
          ) : null}
        </div>
      </form>

      {/* ── Side rail ────────────────────────────────────────────────────── */}
      <div className="grid content-start gap-5 lg:sticky lg:top-6 lg:self-start">
        {/* Live payload */}
        <section className={PANEL_CLASS}>
          <header className="mb-3 flex items-center gap-2">
            <ShieldCheck size={17} className="text-[#0f7a55]" />
            <h2 className="text-[15px] font-extrabold text-[#0f172a]">onChange payload</h2>
          </header>
          <p className="mb-3 text-[12.5px] leading-relaxed text-[#5f7086]">
            القيمة التي يعيدها المكوّن مع كل ضغطة مفتاح، وتتحقق منها Zod مباشرة.
          </p>
          <dl className="grid gap-1.5" dir="ltr">
            {payloadRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-3 rounded-[10px] bg-[#f7f9fc] px-3 py-2"
              >
                <dt className="font-mono text-[12px] font-bold text-[#5f7086]">
                  {row.key}
                  <span className="ml-2 font-sans text-[11px] font-medium text-[#98a6b8]">
                    {row.hint}
                  </span>
                </dt>
                <dd className="font-mono text-[13px] font-bold text-[#0f172a]">
                  {row.value === '' ? <span className="text-[#c3cbd6]">—</span> : row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Submission result */}
        <AnimatePresence initial={false}>
          {submitted && isSubmitSuccessful ? (
            <motion.section
              key="submitted"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-[20px] border border-[#ddf3e9] bg-[#f4fbf7] p-5"
            >
              <header className="mb-2 flex items-center gap-2">
                <CheckCircle2 size={17} className="text-[#0f7a55]" />
                <h2 className="text-[15px] font-extrabold text-[#0f7a55]">تم اجتياز التحقق</h2>
              </header>
              <p className="text-[13px] leading-relaxed text-[#0f2444]">
                رقم اللوحة الذي سيُحفظ في{' '}
                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[12px]">
                  vehicle.plateNumber
                </code>
                :
              </p>
              <p className="mt-2 font-mono text-[20px] font-extrabold text-[#0f172a]" dir="ltr">
                {submitted.plate.fullPlate}
              </p>
              <p className="mt-1 text-[12.5px] text-[#5f7086]">
                {submitted.city} — {submitted.district}
              </p>
            </motion.section>
          ) : null}
        </AnimatePresence>

        {/* Field guide */}
        <section className={cn(PANEL_CLASS, 'bg-[#fbfcfe]')}>
          <h2 className="mb-2 text-[15px] font-extrabold text-[#0f172a]">كيف يعمل المكوّن؟</h2>
          <ul className="grid gap-2 text-[12.5px] leading-relaxed text-[#5f7086]">
            <li>
              • الأرقام: من ١ إلى {SAUDI_PLATE_NUMBER_MAX} — تُحوَّل تلقائيًا إلى الأرقام العربية
              الهندية.
            </li>
            <li>• الحروف: {SAUDI_PLATE_LETTER_COUNT} أحرف لاتينية معتمدة، وتُترجم إلى مقابلها العربي.</li>
            <li>• الحروف العربية تُعرض بترتيب اللوحة الفعلي (من اليسار إلى اليمين).</li>
            <li>• لصق نص مثل «٢٢٢ ط ر ب» يعمل مباشرة دون تعديل يدوي.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

export default InspectionRequestForm
