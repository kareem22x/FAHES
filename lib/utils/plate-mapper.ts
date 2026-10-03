/**
 * Saudi license-plate mapping engine.
 *
 * Single source of truth for translating between the two halves of a Saudi
 * Arabian private-vehicle plate: the Arabic side and the Latin side.
 *
 * ── The standard ────────────────────────────────────────────────────────────
 * A Saudi plate carries **1–4 digits** and **exactly 3 letters**. Only 17 of
 * the 28 Arabic letters are permitted (the rest are excluded for anti-forgery
 * and OCR reasons — e.g. ت/ث/ب and ذ/د look alike). Each permitted Arabic
 * letter has one fixed Latin counterpart, and the Latin side deliberately
 * favours *uniqueness over phonetics* — which is why ح maps to J, م to Z and
 * و to U rather than to a phonetically closer letter.
 *
 * Because only 17 of the 26 Latin letters are legal, the 9 unused ones
 * (C, F, I, M, O, P, Q, W, Y) must be rejected by any input UI.
 *
 * ── One deviation from the brief, on purpose ────────────────────────────────
 * The brief listed `H → ح`. The official standard maps **ح → J** and **ه → H**,
 * so this module follows the standard. Everything derives from the single
 * `SAUDI_PLATE_LETTERS` table below — change that one entry if you ever need
 * the other convention.
 *
 * ── Layout convention ───────────────────────────────────────────────────────
 * `lettersEn` is the *authoritative* field and is stored in logical order
 * (the order the user typed / the order the Latin half reads). `lettersAr` is a
 * **display-order convenience** — the same letters laid out left-to-right as
 * they appear on the physical plate, which is the reverse of the logical order
 * because Arabic reads right-to-left. Hence `BRT → "ط ر ب"`, not `"ب ر ط"`.
 */

/* ==========================================================================
   Constants
   ========================================================================== */

/** Maximum digits on a private-vehicle plate. */
export const SAUDI_PLATE_NUMBER_MAX = 4

/** Every Saudi plate carries exactly three letters. */
export const SAUDI_PLATE_LETTER_COUNT = 3

export type SaudiPlateLetter = {
  /** Latin counterpart printed on the lower half of the plate. */
  latin: string
  /** Arabic letter printed on the upper half of the plate. */
  arabic: string
  /** Transliterated name, handy for legends and tooltips. */
  name: string
}

/**
 * The 17 letters permitted on a Saudi plate, in the official order.
 * This table is the single source of truth for the whole module.
 */
export const SAUDI_PLATE_LETTERS: readonly SaudiPlateLetter[] = [
  { latin: 'A', arabic: 'ا', name: 'Alif' },
  { latin: 'B', arabic: 'ب', name: 'Ba' },
  { latin: 'J', arabic: 'ح', name: 'Ha' },
  { latin: 'D', arabic: 'د', name: 'Dal' },
  { latin: 'R', arabic: 'ر', name: 'Ra' },
  { latin: 'S', arabic: 'س', name: 'Sin' },
  { latin: 'X', arabic: 'ص', name: 'Sad' },
  { latin: 'T', arabic: 'ط', name: 'Ta' },
  { latin: 'E', arabic: 'ع', name: 'Ain' },
  { latin: 'G', arabic: 'ق', name: 'Qaf' },
  { latin: 'K', arabic: 'ك', name: 'Kaf' },
  { latin: 'L', arabic: 'ل', name: 'Lam' },
  { latin: 'Z', arabic: 'م', name: 'Mim' },
  { latin: 'N', arabic: 'ن', name: 'Nun' },
  { latin: 'H', arabic: 'ه', name: 'Ha' },
  { latin: 'U', arabic: 'و', name: 'Waw' },
  { latin: 'V', arabic: 'ي', name: 'Ya' },
] as const

/** The 17 legal Latin letters, in plate order. */
export const SAUDI_PLATE_LATIN_LETTERS: readonly string[] = SAUDI_PLATE_LETTERS.map(
  (letter) => letter.latin,
)

/** The 17 legal Arabic letters, in plate order. */
export const SAUDI_PLATE_ARABIC_LETTERS: readonly string[] = SAUDI_PLATE_LETTERS.map(
  (letter) => letter.arabic,
)

/**
 * Latin letters that never appear on a Saudi plate. Exposed so input UI can
 * explain *why* a keystroke was rejected instead of silently swallowing it.
 */
export const SAUDI_PLATE_EXCLUDED_LATIN_LETTERS: readonly string[] = [
  'C', 'F', 'I', 'M', 'O', 'P', 'Q', 'W', 'Y',
] as const

/** Latin ➜ Arabic lookup. */
export const LATIN_TO_ARABIC_LETTER: Readonly<Record<string, string>> = Object.freeze(
  SAUDI_PLATE_LETTERS.reduce<Record<string, string>>((map, letter) => {
    map[letter.latin] = letter.arabic
    return map
  }, {}),
)

/**
 * Arabic ➜ Latin lookup. Includes the common hamza/alef variants (أ إ آ) and
 * both ya forms (ي ى) so that text pasted from ABShER or a photo-OCR tool
 * normalises correctly instead of being dropped.
 */
export const ARABIC_TO_LATIN_LETTER: Readonly<Record<string, string>> = Object.freeze(
  SAUDI_PLATE_LETTERS.reduce<Record<string, string>>((map, letter) => {
    map[letter.arabic] = letter.latin
    return map
  }, {
    // Alef variants ➜ A
    'أ': 'A',
    'إ': 'A',
    'آ': 'A',
    // Alef maksura ➜ V (same letter as ya on plates)
    'ى': 'V',
  }),
)

/** Arabic-Indic digits (U+0660–U+0669), the ones printed on Saudi plates. */
const ARABIC_INDIC_DIGITS: readonly string[] = [
  '٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩',
]

/** Extended Arabic-Indic / Persian digits — accepted on input for robustness. */
const EXTENDED_ARABIC_INDIC_DIGITS: readonly string[] = [
  '۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹',
]

const ASCII_DIGITS = '0123456789'

/* ==========================================================================
   Value shape
   ========================================================================== */

/**
 * The normalised plate payload emitted by `SaudiPlateInput.onChange`.
 * This is what gets persisted and what the Zod schema validates.
 */
export type SaudiPlateValue = {
  /** ASCII digits, logical order, 0–4 chars. Authoritative. */
  numbers: string
  /** Latin letters, logical order, 0–3 chars. Authoritative. */
  lettersEn: string
  /** Arabic letters in physical display order, space separated (e.g. `ط ر ب`). */
  lettersAr: string
  /** Arabic-Indic digits mirroring `numbers` (e.g. `٢٢٢`). */
  numbersAr: string
  /** Human-readable single line, e.g. `222 BRT`. */
  fullPlate: string
}

/** A plate with nothing filled in yet. */
export const EMPTY_SAUDI_PLATE: SaudiPlateValue = {
  numbers: '',
  lettersEn: '',
  lettersAr: '',
  numbersAr: '',
  fullPlate: '',
}

/* ==========================================================================
   Digits
   ========================================================================== */

/** `222` ➜ `٢٢٢` */
export function toArabicDigits(value: string): string {
  return Array.from(value)
    .map((char) => {
      const index = ASCII_DIGITS.indexOf(char)
      return index === -1 ? char : ARABIC_INDIC_DIGITS[index]
    })
    .join('')
}

/** `٢٢٢` (or `۲۲۲`) ➜ `222`. Non-digits pass through untouched. */
export function toLatinDigits(value: string): string {
  return Array.from(value)
    .map((char) => {
      const indicIndex = ARABIC_INDIC_DIGITS.indexOf(char)
      if (indicIndex !== -1) return ASCII_DIGITS[indicIndex]
      const extendedIndex = EXTENDED_ARABIC_INDIC_DIGITS.indexOf(char)
      if (extendedIndex !== -1) return ASCII_DIGITS[extendedIndex]
      return char
    })
    .join('')
}

/**
 * Accepts anything a user (or a paste, or a scanner) can throw at the number
 * half and returns clean ASCII digits, capped at 4.
 *
 * `"٢٢٢"` ➜ `"222"` · `"12-345"` ➜ `"1234"` · `"abc"` ➜ `""`
 */
export function normalizePlateNumbers(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return ''
  return toLatinDigits(String(input))
    .replace(/\D/g, '')
    .slice(0, SAUDI_PLATE_NUMBER_MAX)
}

/* ==========================================================================
   Letters
   ========================================================================== */

/** True when `value` is a single legal Latin plate letter (case-insensitive). */
export function isSaudiPlateLatinLetter(value: string): boolean {
  return value.length === 1 && LATIN_TO_ARABIC_LETTER[value.toUpperCase()] !== undefined
}

/** True when `value` is a single legal Arabic plate letter. */
export function isSaudiPlateArabicLetter(value: string): boolean {
  return value.length === 1 && ARABIC_TO_LATIN_LETTER[value] !== undefined
}

/** `B` ➜ `ب`. Returns `''` for anything that is not a legal plate letter. */
export function latinToArabicLetter(letter: string): string {
  return LATIN_TO_ARABIC_LETTER[letter.toUpperCase()] ?? ''
}

/** `ب` ➜ `B`. Returns `''` for anything that is not a legal plate letter. */
export function arabicToLatinLetter(letter: string): string {
  return ARABIC_TO_LATIN_LETTER[letter] ?? ''
}

/**
 * The letters of `lettersEn` as Arabic letters in **logical** order.
 * `"BRT"` ➜ `["ب", "ر", "ط"]`
 */
export function toArabicLetters(lettersEn: string): string[] {
  return Array.from(normalizePlateLetters(lettersEn))
    .map((letter) => latinToArabicLetter(letter))
    .filter((letter) => letter !== '')
}

/**
 * The letters of `lettersEn` as Arabic letters in **physical display order**
 * (left-to-right as printed on the plate) — the reverse of logical order.
 * `"BRT"` ➜ `["ط", "ر", "ب"]`
 */
export function toArabicLettersDisplay(lettersEn: string): string[] {
  return toArabicLetters(lettersEn).reverse()
}

/**
 * Accepts Latin **or** Arabic letters and returns the canonical Latin value,
 * capped at 3. Illegal characters (including the 9 banned Latin letters) are
 * dropped, so the caller can safely wire this straight to an `onChange`.
 *
 * `"brt"` ➜ `"BRT"` · `"طرب"` ➜ `"TRB"` · `"B1R!"` ➜ `"BR"`
 */
export function normalizePlateLetters(input: string | null | undefined): string {
  if (!input) return ''
  let result = ''
  for (const raw of Array.from(input)) {
    const upper = raw.toUpperCase()
    const latin =
      LATIN_TO_ARABIC_LETTER[upper] !== undefined ? upper : (ARABIC_TO_LATIN_LETTER[raw] ?? '')
    if (latin !== '') result += latin
    if (result.length >= SAUDI_PLATE_LETTER_COUNT) break
  }
  return result
}

/* ==========================================================================
   Build / parse / compare
   ========================================================================== */

/**
 * Builds the full normalised payload from the two editable halves. Every other
 * function here funnels through this one, so the derived fields can never drift
 * out of sync with the authoritative ones.
 */
export function createSaudiPlateValue(
  numbers: string | number | null | undefined,
  lettersEn: string | null | undefined,
): SaudiPlateValue {
  const safeNumbers = normalizePlateNumbers(numbers)
  const safeLetters = normalizePlateLetters(lettersEn)
  const arabicLetters = toArabicLetters(safeLetters)

  return {
    numbers: safeNumbers,
    lettersEn: safeLetters,
    lettersAr: [...arabicLetters].reverse().join(' '),
    numbersAr: toArabicDigits(safeNumbers),
    fullPlate: [safeNumbers, safeLetters].filter((part) => part !== '').join(' '),
  }
}

/**
 * Coerces whatever a form/DB/URL handed us into a canonical plate value.
 *
 * Accepts a full object (preferred — `lettersEn` wins), a human string such as
 * `"222 BRT"`, or an Arabic string such as `"٢٢٢ ط ر ب"`. Strings are read in
 * logical order, so Arabic letters typed naturally (right-to-left) map
 * correctly; note that feeding the *display* field `lettersAr` back in will
 * reverse the letter order — round-trip via `lettersEn`.
 */
export function parseSaudiPlate(
  input: SaudiPlateValue | string | null | undefined,
): SaudiPlateValue {
  if (input === null || input === undefined || input === '') {
    return { ...EMPTY_SAUDI_PLATE }
  }
  if (typeof input !== 'string') {
    return createSaudiPlateValue(input.numbers, input.lettersEn)
  }
  return createSaudiPlateValue(normalizePlateNumbers(input), normalizePlateLetters(input))
}

/** True when both halves satisfy the plate rules (1–4 digits, exactly 3 letters). */
export function isSaudiPlateComplete(value: SaudiPlateValue): boolean {
  return (
    /^\d{1,4}$/.test(value.numbers) &&
    value.lettersEn.length === SAUDI_PLATE_LETTER_COUNT &&
    Array.from(value.lettersEn).every(isSaudiPlateLatinLetter)
  )
}

/** Shallow equality on the two authoritative halves. */
export function saudiPlateEquals(a: SaudiPlateValue, b: SaudiPlateValue): boolean {
  return a.numbers === b.numbers && a.lettersEn === b.lettersEn
}

/**
 * Field-level validation messages in Arabic, ready to render under the input.
 * `null` means the field is fine. Used by the Zod schema so the UI and the
 * resolver can never disagree about what "valid" means.
 */
export function validateSaudiPlate(value: SaudiPlateValue): {
  numbers: string | null
  lettersEn: string | null
} {
  let numbers: string | null = null
  if (value.numbers.length === 0) {
    numbers = 'أدخل رقم اللوحة.'
  } else if (!/^\d+$/.test(value.numbers)) {
    numbers = 'رقم اللوحة يقبل الأرقام فقط.'
  }

  let lettersEn: string | null = null
  if (value.lettersEn.length === 0) {
    lettersEn = 'أدخل حروف اللوحة الثلاثة.'
  } else if (value.lettersEn.length < SAUDI_PLATE_LETTER_COUNT) {
    lettersEn = `أدخل ${SAUDI_PLATE_LETTER_COUNT} حروف — تبقّى ${
      SAUDI_PLATE_LETTER_COUNT - value.lettersEn.length
    }.`
  } else if (!Array.from(value.lettersEn).every(isSaudiPlateLatinLetter)) {
    lettersEn = 'حروف اللوحة السعودية محصورة في ١٧ حرفًا معتمدًا.'
  }

  return { numbers, lettersEn }
}

/** Convenience: `true` when at least one character has been entered. */
export function isSaudiPlateEmpty(value: SaudiPlateValue): boolean {
  return value.numbers === '' && value.lettersEn === ''
}
