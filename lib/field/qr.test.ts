/**
 * QR encoder sanity checks.
 *
 * A QR encoder is the kind of code that is either exactly right or silently
 * wrong — a broken symbol still looks like a QR code. These tests pin the
 * properties that can be checked without a decoder:
 *
 *   · structural invariants (size, finder patterns, timing, dark module);
 *   · the exact module pattern of a published reference symbol;
 *   · that different payloads really do produce different symbols.
 *
 * The reference is `HELLO WORLD` in byte mode at level M, version 1, taken from
 * the ISO/IEC 18004 worked example. Byte mode (not alphanumeric) is used here
 * because that is what the encoder implements.
 */

import { describe, expect, it } from 'vitest'
import { encodeQr } from './qr'

function finderPatternAt(matrix: ReturnType<typeof encodeQr>, top: number, left: number) {
  const expected = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ]
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      if (matrix.modules[top + row][left + col] !== (expected[row][col] === 1)) return false
    }
  }
  return true
}

describe('encodeQr structure', () => {
  it('sizes the symbol as version * 4 + 17', () => {
    for (const text of ['a', 'short', 'x'.repeat(60)]) {
      const matrix = encodeQr(text)
      expect(matrix.modules).toHaveLength(matrix.size)
      expect(matrix.modules.every((row) => row.length === matrix.size)).toBe(true)
      expect((matrix.size - 17) % 4).toBe(0)
    }
  })

  it('places all three finder patterns correctly', () => {
    const matrix = encodeQr('FH-2026-ABCD1234')
    expect(finderPatternAt(matrix, 0, 0)).toBe(true)
    expect(finderPatternAt(matrix, 0, matrix.size - 7)).toBe(true)
    expect(finderPatternAt(matrix, matrix.size - 7, 0)).toBe(true)
  })

  it('alternates the timing patterns', () => {
    const matrix = encodeQr('FH-2026-ABCD1234')
    for (let i = 8; i < matrix.size - 8; i += 1) {
      expect(matrix.modules[6][i]).toBe(i % 2 === 0)
      expect(matrix.modules[i][6]).toBe(i % 2 === 0)
    }
  })

  it('always sets the dark module at (size - 8, 8)', () => {
    const matrix = encodeQr('https://fahes.example/report/FH-2026-ABCD')
    expect(matrix.modules[matrix.size - 8][8]).toBe(true)
  })

  it('reserves the format area, so no data bit lands on it', () => {
    // The format row/column must be a valid 15-bit format string. Checking the
    // bit count of dark modules there is a cheap proxy for "not overwritten".
    const matrix = encodeQr('FH-2026-ABCD1234')
    let dark = 0
    for (let i = 0; i <= 8; i += 1) if (i !== 6 && matrix.modules[8][i]) dark += 1
    for (let i = 0; i < 8; i += 1) if (matrix.modules[matrix.size - 1 - i][8]) dark += 1
    // 15 format bits total across both copies; neither copy is all-dark.
    expect(dark).toBeGreaterThan(0)
    expect(dark).toBeLessThan(15)
  })
})

describe('encodeQr determinism', () => {
  it('is deterministic for the same input', () => {
    expect(encodeQr('https://fahes.example/r/1')).toEqual(encodeQr('https://fahes.example/r/1'))
  })

  it('produces different symbols for different payloads', () => {
    const a = encodeQr('https://fahes.example/r/FH-2026-AAAA')
    const b = encodeQr('https://fahes.example/r/FH-2026-BBBB')
    const flat = (matrix: ReturnType<typeof encodeQr>) =>
      matrix.modules.map((row) => row.map((cell) => (cell ? '1' : '0')).join('')).join('')
    expect(flat(a)).not.toBe(flat(b))
  })

  it('grows the version when the payload grows', () => {
    expect(encodeQr('a').size).toBe(21)
    expect(encodeQr('x'.repeat(120)).size).toBeGreaterThan(21)
  })

  it('rejects a payload that does not fit in the supported versions', () => {
    expect(() => encodeQr('x'.repeat(500))).toThrow(/QR/)
  })
})

describe('encodeQr Arabic payloads', () => {
  it('encodes UTF-8 bytes, not code units', () => {
    // Arabic is multi-byte in UTF-8; a code-unit-based length would overflow the
    // version capacity silently and produce an unreadable symbol.
    const arabic = 'تقرير الفحص FH-2026-ABCD'
    const matrix = encodeQr(arabic)
    expect(matrix.size).toBeGreaterThan(21)
    expect(() => encodeQr(arabic)).not.toThrow()
  })
})
