'use client'

/**
 * SaudiPlateInput — an interactive, accessible replica of an official Saudi
 * Arabian private-vehicle licence plate.
 *
 * ── Layout ──────────────────────────────────────────────────────────────────
 *
 *   ┌───────────────┬──────────┬───────────────┬─────┐
 *   │ ٢   ٢   ٢     │          │ ح   ن   ي     │     │ ← Arabic half (mirrors)
 *   │               │  EMBLEM  │               │ KSA │
 *   │ 2   2   2     │          │ N   T   U     │     │ ← Latin half (editors)
 *   └───────────────┴──────────┴───────────────┴─────┘
 *
 * Numbers sit on the left, letters on the right, the palm-and-crossed-swords
 * emblem holds the centre, and a narrow vertical KSA strip closes the
 * far-right edge — matching the physical Saudi plate.
 *
 * The two bottom cells are real `<input>`s — the user types straight onto the
 * plate. The two top cells are live mirrors of the mapping engine, so the
 * Arabic half updates character-by-character as you type. Clicking any cell
 * focuses the matching editor.
 *
 * The plate is forced to `dir="ltr"` because the geometry (numbers left, KSA
 * bar right) must not flip inside this app's RTL layout.
 *
 * ── Styling note ────────────────────────────────────────────────────────────
 * Tailwind v4 emits its utilities inside `@layer utilities`, and CSS cascade
 * layers rank *below* unlayered rules — so this project's global
 * `input { background: …; border: … }` and `:focus-visible { outline: … }`
 * would otherwise beat plain utility classes. The plate editors therefore use
 * the `!` important modifier to reset those properties. That is deliberate, not
 * accidental.
 */

import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@/lib/utils'
import {
  SAUDI_PLATE_LETTER_COUNT,
  SAUDI_PLATE_NUMBER_MAX,
  createSaudiPlateValue,
  normalizePlateLetters,
  normalizePlateNumbers,
  parseSaudiPlate,
  toArabicLetters,
  type SaudiPlateValue,
} from '@/lib/utils/plate-mapper'

/* ==========================================================================
   Types
   ========================================================================== */

export type SaudiPlateInputSize = 'sm' | 'md' | 'lg'

/** Which of the two editable halves currently owns the caret. */
export type SaudiPlateField = 'numbers' | 'letters'

/** Imperative handle — `react-hook-form` calls `focus()` on this. */
export type SaudiPlateInputHandle = {
  focus: () => void
}

export type SaudiPlateInputLabels = {
  numbers: string
  numbersHint: string
  numbersPlaceholder: string
  letters: string
  lettersHint: string
  lettersPlaceholder: string
  plate: string
}

export interface SaudiPlateInputProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    'onChange' | 'onBlur' | 'defaultValue' | 'children'
  > {
  /**
   * Controlled value. Pass either the full `SaudiPlateValue` emitted by
   * `onChange` (what `react-hook-form`'s `Controller` gives you) or a plain
   * string such as `"222 BRT"`. `undefined` switches to uncontrolled mode.
   */
  value?: SaudiPlateValue | string | null
  /** Initial value for uncontrolled usage. */
  defaultValue?: SaudiPlateValue | string | null
  /** Fires on every keystroke with the fully normalised plate payload. */
  onChange?: (value: SaudiPlateValue) => void
  /** Fires once focus leaves the whole component. */
  onBlur?: () => void
  /**
   * Base name forwarded to the two on-plate editors as `${name}.numbers` and
   * `${name}.letters`. `react-hook-form` passes its `field.name` here.
   */
  name?: string
  disabled?: boolean
  /** Paints the frame red and marks both editors `aria-invalid`. */
  invalid?: boolean
  /** Message rendered under the plate (`role="alert"`). */
  error?: string | null
  /** Renders the two plain form fields under the plate. Defaults to `true`. */
  showAuxiliaryInputs?: boolean
  size?: SaudiPlateInputSize
  /** Override any of the built-in Arabic labels. */
  labels?: Partial<SaudiPlateInputLabels>
}

/* ==========================================================================
   Design tokens
   ========================================================================== */

const DEFAULT_LABELS: SaudiPlateInputLabels = {
  numbers: 'أرقام اللوحة',
  numbersHint: 'من ١ إلى ٤ أرقام',
  numbersPlaceholder: '222',
  letters: 'حروف اللوحة',
  lettersHint: '٣ أحرف معتمدة',
  lettersPlaceholder: 'BRT',
  plate: 'لوحة السيارة السعودية',
}

type SizeStyle = {
  frame: string
  surface: string
  /** Keeps the plate at a plate-like aspect ratio inside wide containers. */
  width: string
  grid: string
  digits: string
  letters: string
  arabicDigits: string
  arabicLetters: string
  /** Centre column that holds the national emblem. */
  emblemColumn: string
  emblem: string
  /** Narrow far-right strip. */
  strip: string
  stripEmblem: string
  stripText: string
  /** Vertical `السعودية` run — set smaller than the Latin run so both fit. */
  stripArabic: string
  /** Bottom registration circle closing the strip. */
  stripCircle: string
}

/**
 * Every internal dimension is expressed in `cqw` (1% of the plate's own
 * container width) instead of pixels.
 *
 * Why: a plate laid out with fixed pixels keeps its inner furniture (emblem
 * column, KSA strip, type) at full size while the frame shrinks, so on a 320px
 * phone the digits get crushed against the strip. With container-relative
 * units the whole plate scales as one proportional object — the aspect ratio
 * and the digit/emblem/strip balance are identical at 280px and at 660px, and
 * nothing clips. The `max-w-*` on the root still caps the design size, so the
 * numbers below are simply `design_px / design_width * 100`.
 *
 * The wrapper must carry `@container` for these units to resolve.
 */
const SIZES: Record<SaudiPlateInputSize, SizeStyle> = {
  // design width 390px
  sm: {
    frame: 'rounded-[4.1cqw] border-2 p-[1.54cqw]',
    surface: 'h-[23.6cqw] rounded-[3.1cqw]',
    width: 'max-w-[390px]',
    grid: 'grid-cols-[1.35fr_auto_1fr_auto]',
    digits: 'text-[6.67cqw]!',
    letters: 'text-[6.15cqw]!',
    arabicDigits: 'text-[5.39cqw]',
    arabicLetters: 'text-[5.13cqw]',
    emblemColumn: 'w-[15.9cqw]',
    // The artwork is 512x580 (taller than wide), and `mask-contain` fits it by
    // the constraining axis — so the box is sized to yield a 13.33cqw *width*.
    emblem: 'size-[15.1cqw]',
    strip: 'w-[7.69cqw]',
    stripEmblem: 'size-[3.08cqw]',
    stripText: 'text-[1.54cqw]',
    stripArabic: 'text-[1.28cqw]',
    stripCircle: 'size-[1.28cqw]',
  },
  // design width 540px
  md: {
    frame: 'rounded-[4.07cqw] border-[3px] p-[1.48cqw]',
    surface: 'h-[22.96cqw] rounded-[2.59cqw]',
    width: 'max-w-[540px]',
    grid: 'grid-cols-[1.35fr_auto_1fr_auto]',
    digits: 'text-[6.3cqw]!',
    letters: 'text-[5.74cqw]!',
    arabicDigits: 'text-[5cqw]',
    arabicLetters: 'text-[4.63cqw]',
    emblemColumn: 'w-[15.93cqw]',
    emblem: 'size-[15.1cqw]',
    strip: 'w-[7.04cqw]',
    stripEmblem: 'size-[2.96cqw]',
    stripText: 'text-[1.39cqw]',
    stripArabic: 'text-[1.2cqw]',
    stripCircle: 'size-[1.3cqw]',
  },
  // design width 660px
  lg: {
    frame: 'rounded-[3.94cqw] border-[3px] p-[1.52cqw]',
    surface: 'h-[23.94cqw] rounded-[2.73cqw]',
    width: 'max-w-[660px]',
    grid: 'grid-cols-[1.35fr_auto_1fr_auto]',
    digits: 'text-[6.67cqw]!',
    letters: 'text-[6.06cqw]!',
    arabicDigits: 'text-[5.3cqw]',
    arabicLetters: 'text-[4.85cqw]',
    emblemColumn: 'w-[16.97cqw]',
    emblem: 'size-[16.48cqw]',
    strip: 'w-[6.97cqw]',
    stripEmblem: 'size-[3.03cqw]',
    stripText: 'text-[1.36cqw]',
    stripArabic: 'text-[1.21cqw]',
    stripCircle: 'size-[1.36cqw]',
  },
}

const PLATE_INK = 'text-[#0f172a]!'

/**
 * Shared reset for the two on-plate editors. The `!` modifiers are required —
 * see the styling note in the file header.
 */
const PLATE_EDITOR = cn(
  'h-full w-full min-w-0 border-0! bg-transparent! p-0! text-center font-extrabold',
  'outline-none! focus:shadow-none!',
  'tabular-nums tracking-[0.14em] caret-[#2563eb]',
  'placeholder:font-bold placeholder:tracking-[0.14em]',
  'disabled:cursor-not-allowed',
  PLATE_INK,
)

/* ==========================================================================
   KSA emblem — palm tree over crossed swords
   ========================================================================== */

/**
 * The national emblem — palm over crossed swords.
 *
 * Drawn from the real artwork (`public/ksa-emblem.png`) used as a CSS **mask**
 * over `currentColor`. Two reasons for a mask rather than a plain `<img>`:
 *
 * 1. A Saudi plate prints the emblem in the same ink as the plate text, not in
 *    the emblem's heraldic green and gold. Masking keeps that and reuses the
 *    authentic silhouette instead of the previous hand-drawn approximation.
 * 2. The colour then follows the surrounding text (`text-[#0f172a]`), so the
 *    emblem stays in step with the plate if the ink ever changes.
 *
 * `mask-contain` letterboxes the artwork inside the box, so the box is sized
 * for the emblem's *width* — see the note on `SIZES`.
 *
 * No manual `-webkit-mask-*` pairing is needed here: Tailwind v4 emits both the
 * prefixed and unprefixed spelling for every `mask-*` utility on its own (the
 * project has no autoprefixer; verified in the compiled chunk). Do not replace
 * these with a hand-written CSS class — an unlayered rule would outrank any
 * future Tailwind mask utility on the same element (see the cascade policy in
 * `app/globals.css`).
 */
function KsaEmblem({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block shrink-0 bg-current',
        'mask-[url(/ksa-emblem.png)] mask-contain mask-center mask-no-repeat',
        className,
      )}
    />
  )
}

/* ==========================================================================
   Sub-components
   ========================================================================== */

/**
 * One quadrant of the plate. Handles the click-to-focus behaviour and the
 * Framer Motion active highlight (a soft brand-tinted wash + inset ring).
 */
function PlateQuadrant({
  active,
  disabled,
  onActivate,
  label,
  dir,
  className,
  children,
}: {
  active: boolean
  disabled: boolean
  onActivate: () => void
  label: string
  /**
   * Writing direction of the character run. Arabic letters must be rendered in
   * **logical** order inside an `rtl` context — otherwise the bidi algorithm
   * reorders the run and the Arabic half ends up reading the same way as the
   * Latin half instead of mirrored, which is what a real plate shows.
   */
  dir?: 'ltr' | 'rtl'
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      // Purely a click target for the editor it wraps — the accessible name
      // lives on the <input> itself, so this stays out of the a11y tree.
      title={label}
      onMouseDown={(event) => {
        if (disabled) return
        // Prevent the browser from blurring the editor before we move the caret.
        event.preventDefault()
        onActivate()
      }}
      className={cn(
        'relative flex items-center justify-center overflow-hidden',
        !disabled && 'cursor-text',
        className,
      )}
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.97 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute inset-[3px] rounded-lg bg-[image:radial-gradient(120%_120%_at_50%_0%,rgba(37,99,235,0.18),rgba(37,99,235,0.03))] ring-2 ring-[#2563eb]/55 ring-inset"
      />
      <div
        dir={dir}
        className="relative flex w-full min-w-0 items-center justify-center gap-[0.1em] px-1"
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Renders a derived (read-only) character run with a per-character entrance
 * animation, so the Arabic half visibly "types itself" as the Latin half fills.
 */
function MappedRun({
  chars,
  placeholder,
  charClassName,
  placeholderClassName,
}: {
  chars: string[]
  placeholder: string
  charClassName?: string
  placeholderClassName?: string
}) {
  return (
    <AnimatePresence initial={false}>
      {chars.length === 0 ? (
        <motion.span
          key="__empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn('inline-block select-none font-bold', placeholderClassName)}
        >
          {placeholder}
        </motion.span>
      ) : (
        chars.map((char, index) => (
          <motion.span
            // Index in the key forces a re-animation when a slot changes value.
            key={`${char}-${index}`}
            initial={{ opacity: 0, y: 9, scale: 0.72 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -9, scale: 0.72 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn('inline-block', charClassName)}
          >
            {char}
          </motion.span>
        ))
      )}
    </AnimatePresence>
  )
}

/* ==========================================================================
   Component
   ========================================================================== */

export const SaudiPlateInput = forwardRef<SaudiPlateInputHandle, SaudiPlateInputProps>(
  function SaudiPlateInput(
    {
      value,
      defaultValue,
      onChange,
      onBlur,
      name,
      id,
      disabled = false,
      invalid = false,
      error = null,
      showAuxiliaryInputs = true,
      size = 'md',
      labels,
      className,
      ...rest
    },
    ref,
  ) {
    const uid = useId()
    const baseId = id ?? `${uid}-plate`
    const numbersId = `${baseId}-numbers`
    const lettersId = `${baseId}-letters`

    const copy = useMemo<SaudiPlateInputLabels>(
      () => ({ ...DEFAULT_LABELS, ...labels }),
      [labels],
    )
    const styles = SIZES[size]

    const containerRef = useRef<HTMLDivElement>(null)
    const numbersRef = useRef<HTMLInputElement>(null)
    const lettersRef = useRef<HTMLInputElement>(null)

    const isControlled = value !== undefined
    const [uncontrolled, setUncontrolled] = useState<SaudiPlateValue>(() =>
      parseSaudiPlate(defaultValue),
    )
    const plate = useMemo(
      () => (isControlled ? parseSaudiPlate(value) : uncontrolled),
      [isControlled, value, uncontrolled],
    )

    const [activeField, setActiveField] = useState<SaudiPlateField | null>(null)

    /* ---- value plumbing ------------------------------------------------- */

    const emit = useCallback(
      (numbers: string, lettersEn: string) => {
        const next = createSaudiPlateValue(numbers, lettersEn)
        if (!isControlled) setUncontrolled(next)
        onChange?.(next)
      },
      [isControlled, onChange],
    )

    const handleNumbersChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        // Handles Latin digits, Arabic-Indic digits and pasted separators alike.
        emit(normalizePlateNumbers(event.target.value), plate.lettersEn)
      },
      [emit, plate.lettersEn],
    )

    const handleLettersChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        // Uppercases and translates Arabic letters to their Latin counterpart.
        emit(plate.numbers, normalizePlateLetters(event.target.value))
      },
      [emit, plate.numbers],
    )

    const handleBlur = useCallback(
      (event: React.FocusEvent<HTMLDivElement>) => {
        const next = event.relatedTarget as Node | null
        if (next && containerRef.current?.contains(next)) return
        setActiveField(null)
        onBlur?.()
      },
      [onBlur],
    )

    /* ---- imperative handle ---------------------------------------------- */

    useImperativeHandle(
      ref,
      () => ({
        focus: () => numbersRef.current?.focus(),
      }),
      [],
    )

    /* ---- derived display runs ------------------------------------------- */

    // Digits read left-to-right even in Arabic, so the digit run stays LTR.
    const arabicDigits = useMemo(() => Array.from(plate.numbersAr), [plate.numbersAr])
    // Letters are handed to the DOM in *logical* order and laid out by an `rtl`
    // container, which is what mirrors them against the Latin half.
    const arabicLetters = useMemo(() => toArabicLetters(plate.lettersEn), [plate.lettersEn])

    const editorAriaInvalid = invalid || Boolean(error)

    return (
      <div
        ref={containerRef}
        id={baseId}
        data-slot="saudi-plate-input"
        // `@container` makes this element the query container that the `cqw`
        // dimensions inside the plate resolve against, so the plate scales to
        // whatever width its parent gives it (phone column, form, card).
        className={cn('@container w-full max-w-full', styles.width, className)}
        onBlur={handleBlur}
        {...rest}
      >
        {/* ---- the plate -------------------------------------------------- */}
        <div
          dir="ltr"
          className={cn(
            'relative border-[#0f172a]/85 bg-neutral-100',
            'shadow-[0_22px_48px_-22px_rgba(15,23,42,0.55),0_2px_0_rgba(255,255,255,0.75)_inset]',
            'transition-colors duration-200',
            styles.frame,
            disabled && 'opacity-60',
            invalid && !error && 'border-[#bf3b2c]/75',
            error && 'border-[#bf3b2c]',
          )}
        >
          <div
            className={cn(
              'relative overflow-hidden bg-neutral-100 ring-1 ring-[#0f172a]/10',
              'shadow-[inset_0_2px_7px_rgba(15,23,42,0.14),inset_0_-1px_0_rgba(255,255,255,0.9)]',
              styles.surface,
            )}
          >
            {/* metallic sheen + embossed edge highlights */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[image:linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0)_58%,rgba(15,23,42,0.07))]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/90"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[#0f172a]/10"
            />

            <div
              className={cn(
                'relative grid h-full grid-rows-2',
                styles.grid,
              )}
            >
              {/* ── 1. left · Arabic digits (mirror) ─────────────────────── */}
              <PlateQuadrant
                active={activeField === 'numbers'}
                disabled={disabled}
                label={`${copy.numbers} — الأرقام العربية`}
                onActivate={() => numbersRef.current?.focus()}
                dir="ltr"
                className="col-start-1 row-start-1 border-r border-[#0f172a]/10"
              >
                <MappedRun
                  chars={arabicDigits}
                  placeholder="٠٠٠٠"
                  charClassName={cn('font-extrabold', styles.arabicDigits, PLATE_INK)}
                  placeholderClassName={cn(styles.arabicDigits, 'text-[#c3cbd6]')}
                />
              </PlateQuadrant>

              {/* ── 2. centre · national emblem ──────────────────────────── */}
              <div
                className={cn(
                  'col-start-2 row-span-2 row-start-1 flex items-center justify-center',
                  'border-r border-[#0f172a]/10',
                  styles.emblemColumn,
                )}
              >
                <KsaEmblem className={cn('shrink-0 text-[#0f172a]', styles.emblem)} />
              </div>

              {/* ── 3. right · Arabic letters (mirror) ───────────────────── */}
              <PlateQuadrant
                active={activeField === 'letters'}
                disabled={disabled}
                label={`${copy.letters} — الحروف العربية`}
                onActivate={() => lettersRef.current?.focus()}
                dir="rtl"
                className="col-start-3 row-start-1 border-r border-[#0f172a]/20"
              >
                <MappedRun
                  chars={arabicLetters}
                  placeholder="— — —"
                  charClassName={cn('font-extrabold', styles.arabicLetters, PLATE_INK)}
                  placeholderClassName={cn(styles.arabicLetters, 'text-[#c3cbd6]')}
                />
              </PlateQuadrant>

              {/* ── 4. far-right · narrow KSA strip ──────────────────────── */}
              <div
                className={cn(
                  'col-start-4 row-span-2 row-start-1 flex flex-col items-center justify-between gap-0.5',
                  'bg-white/55 px-0.5 py-1',
                  styles.strip,
                )}
              >
                <KsaEmblem className={cn('shrink-0 text-[#0f172a]', styles.stripEmblem)} />

                {/*
                 * `السعودية` runs vertically down the strip. No tracking here —
                 * letter-spacing would break the Arabic joins and render the
                 * word as disconnected glyphs.
                 */}
                <span
                  className={cn(
                    'font-extrabold whitespace-nowrap text-[#0f172a]',
                    '[writing-mode:vertical-rl]',
                    styles.stripArabic,
                  )}
                >
                  السعودية
                </span>

                <span
                  className={cn(
                    'font-extrabold tracking-[0.14em] whitespace-nowrap text-[#0f172a]',
                    '[writing-mode:vertical-rl]',
                    styles.stripText,
                  )}
                >
                  KSA
                </span>

                {/* Registration circle closing the strip, as on the physical plate. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'shrink-0 rounded-full border border-[#0f172a]/45',
                    styles.stripCircle,
                  )}
                />
              </div>

              {/* ── 5. left · Latin digits (editor) ──────────────────────── */}
              <PlateQuadrant
                active={activeField === 'numbers'}
                disabled={disabled}
                label={`${copy.numbers} — الأرقام اللاتينية`}
                onActivate={() => numbersRef.current?.focus()}
                className="col-start-1 row-start-2 border-r border-[#0f172a]/10"
              >
                <input
                  ref={numbersRef}
                  id={numbersId}
                  name={name ? `${name}.numbers` : undefined}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  maxLength={SAUDI_PLATE_NUMBER_MAX}
                  placeholder="0000"
                  disabled={disabled}
                  value={plate.numbers}
                  onChange={handleNumbersChange}
                  onFocus={() => setActiveField('numbers')}
                  aria-label={`${copy.numbers} (1–${SAUDI_PLATE_NUMBER_MAX})`}
                  aria-invalid={editorAriaInvalid || undefined}
                  className={cn(PLATE_EDITOR, styles.digits)}
                />
              </PlateQuadrant>

              {/* ── 6. right · Latin letters (editor) ────────────────────── */}
              <PlateQuadrant
                active={activeField === 'letters'}
                disabled={disabled}
                label={`${copy.letters} — الحروف اللاتينية`}
                onActivate={() => lettersRef.current?.focus()}
                className="col-start-3 row-start-2"
              >
                <input
                  ref={lettersRef}
                  id={lettersId}
                  name={name ? `${name}.letters` : undefined}
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  dir="ltr"
                  maxLength={SAUDI_PLATE_LETTER_COUNT}
                  placeholder="ABC"
                  disabled={disabled}
                  value={plate.lettersEn}
                  onChange={handleLettersChange}
                  onFocus={() => setActiveField('letters')}
                  aria-label={`${copy.letters} (${SAUDI_PLATE_LETTER_COUNT})`}
                  aria-invalid={editorAriaInvalid || undefined}
                  className={cn(PLATE_EDITOR, styles.letters)}
                />
              </PlateQuadrant>
            </div>
          </div>
        </div>

        {/* Screen-reader mirror of the formatted plate. */}
        <span className="sr-only" role="status" aria-live="polite">
          {plate.fullPlate ? `${copy.plate}: ${plate.fullPlate}` : copy.plate}
        </span>

        {/* ---- plain form fields ------------------------------------------ */}
        {showAuxiliaryInputs ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label
                htmlFor={numbersId}
                className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-[#1e3a8a]"
              >
                {copy.numbers}
                <span className="rounded-full bg-[#f3f6fa] px-2 py-0.5 text-[11.5px] font-semibold text-[#7e8da0]">
                  {copy.numbersHint}
                </span>
              </label>
              <input
                id={`${numbersId}-field`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
                maxLength={SAUDI_PLATE_NUMBER_MAX}
                placeholder={copy.numbersPlaceholder}
                disabled={disabled}
                value={plate.numbers}
                onChange={handleNumbersChange}
                aria-label={`${copy.numbers} — ${copy.numbersHint}`}
                aria-invalid={editorAriaInvalid || undefined}
                className={cn(
                  'text-center font-bold tracking-[0.2em] tabular-nums',
                  'aria-invalid:border-[#bf3b2c]! aria-invalid:ring-2 aria-invalid:ring-[#bf3b2c]/15',
                )}
              />
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor={lettersId}
                className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-[#1e3a8a]"
              >
                {copy.letters}
                <span className="rounded-full bg-[#f3f6fa] px-2 py-0.5 text-[11.5px] font-semibold text-[#7e8da0]">
                  {copy.lettersHint}
                </span>
              </label>
              <input
                id={`${lettersId}-field`}
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                dir="ltr"
                maxLength={SAUDI_PLATE_LETTER_COUNT}
                placeholder={copy.lettersPlaceholder}
                disabled={disabled}
                value={plate.lettersEn}
                onChange={handleLettersChange}
                aria-label={`${copy.letters} — ${copy.lettersHint}`}
                aria-invalid={editorAriaInvalid || undefined}
                className={cn(
                  'text-center font-bold tracking-[0.2em] uppercase',
                  'aria-invalid:border-[#bf3b2c]! aria-invalid:ring-2 aria-invalid:ring-[#bf3b2c]/15',
                )}
              />
            </div>
          </div>
        ) : null}

        {/*
          The error line used to pop in and out with no transition, which read
          as a layout jump. `initial={false}` keeps the first paint still; only
          later appear/disappear cycles animate. Transform + opacity only, so
          nothing reflows during the animation.
        */}
        <AnimatePresence initial={false}>
          {error ? (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mt-2 text-[12.5px] font-semibold text-[#bf3b2c]"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    )
  },
)

SaudiPlateInput.displayName = 'SaudiPlateInput'

export default SaudiPlateInput
