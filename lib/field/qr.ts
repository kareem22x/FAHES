/**
 * QR code encoder — byte mode, versions 1–10, error-correction level M.
 *
 * ── Why hand-rolled ─────────────────────────────────────────────────────────
 * The alternative is a dependency (`qrcode`, ~40 KB) for a feature that draws
 * one symbol on one screen. This is the same trade-off as the audio alert:
 * implementation cost is bounded and known, and a field app that ships fewer
 * kilobytes to a metered connection is a better field app.
 *
 * ── Scope, stated honestly ──────────────────────────────────────────────────
 * Byte mode only (no numeric/alphanumeric compaction), EC level M, versions
 * 1–10 — which is 271 bytes at level M. A report URL is well inside that. If a
 * longer payload is ever needed, either raise the version table or use a short
 * opaque token instead of an inline URL, which is the better design anyway.
 *
 * The output is a flat boolean module matrix at 1 bit per module, so the
 * renderer decides the pixel size and the quiet zone.
 */

// ---------------------------------------------------------------------------
// Galois field GF(256) with the QR primitive polynomial 0x11D
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

;(() => {
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]
})()

function multiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

/** Generator polynomial for `degree` error-correction codewords. */
function generatorPolynomial(degree: number): number[] {
  let polynomial = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0)
    for (let j = 0; j < polynomial.length; j += 1) {
      next[j] ^= polynomial[j]
      next[j + 1] ^= multiply(polynomial[j], EXP[i])
    }
    polynomial = next
  }
  return polynomial
}

/** Reed–Solomon remainder: the error-correction codewords for one block. */
function errorCorrection(data: number[], degree: number): number[] {
  const generator = generatorPolynomial(degree)
  const remainder = new Array<number>(degree).fill(0)
  for (const byte of data) {
    const factor = byte ^ remainder[0]
    remainder.shift()
    remainder.push(0)
    if (factor !== 0) {
      for (let i = 0; i < degree; i += 1) {
        remainder[i] ^= multiply(generator[i + 1], factor)
      }
    }
  }
  return remainder
}

// ---------------------------------------------------------------------------
// Version tables — level M only
// ---------------------------------------------------------------------------

type VersionSpec = {
  version: number
  /** Data codewords in the whole symbol. */
  dataCodewords: number
  ecCodewordsPerBlock: number
  /** [block count, data codewords per block] pairs. */
  groups: Array<[number, number]>
}

/**
 * Level M (15% recovery). Chosen because it is the QR default for print and
 * screens alike, and because a screen-rendered code on a phone held at arm's
 * length has more margin than a printed label someone has scratched.
 */
const VERSIONS_M: VersionSpec[] = [
  { version: 1, dataCodewords: 16, ecCodewordsPerBlock: 10, groups: [[1, 16]] },
  { version: 2, dataCodewords: 28, ecCodewordsPerBlock: 16, groups: [[1, 28]] },
  { version: 3, dataCodewords: 44, ecCodewordsPerBlock: 26, groups: [[1, 44]] },
  { version: 4, dataCodewords: 64, ecCodewordsPerBlock: 18, groups: [[2, 32]] },
  { version: 5, dataCodewords: 86, ecCodewordsPerBlock: 24, groups: [[2, 43]] },
  { version: 6, dataCodewords: 108, ecCodewordsPerBlock: 16, groups: [[4, 27]] },
  { version: 7, dataCodewords: 124, ecCodewordsPerBlock: 18, groups: [[4, 31]] },
  { version: 8, dataCodewords: 154, ecCodewordsPerBlock: 22, groups: [[2, 38], [2, 39]] },
  { version: 9, dataCodewords: 182, ecCodewordsPerBlock: 22, groups: [[3, 36], [2, 37]] },
  { version: 10, dataCodewords: 216, ecCodewordsPerBlock: 26, groups: [[4, 43], [1, 44]] },
]

/** Row/column centres of the alignment patterns, by version. */
const ALIGNMENT_CENTRES: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
}

const EC_LEVEL_M_BITS = 0b00
const EC_LEVEL_L_BITS = 0b01
const EC_LEVEL_H_BITS = 0b10
const EC_LEVEL_Q_BITS = 0b11

/**
 * Version → 15-bit format-information value. The format string is
 * (5 data bits << 10) | BCH, XOR'd with 0x5412. Precomputed because the BCH
 * arithmetic is easy to get subtly wrong and impossible to eyeball.
 */
const FORMAT_BITS: Record<number, number> = {
  [EC_LEVEL_L_BITS]: 0x77c4,
  [EC_LEVEL_M_BITS]: 0x5412,
  [EC_LEVEL_Q_BITS]: 0x355f,
  [EC_LEVEL_H_BITS]: 0x1689,
}

type BitBuffer = number[]

function pushBits(buffer: BitBuffer, value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) buffer.push((value >>> i) & 1)
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

export type QrMatrix = {
  size: number
  /** `modules[row][col]`, true = dark. */
  modules: boolean[][]
}

/**
 * Encode `text` as a QR symbol. Throws when the payload does not fit in
 * version 10 at level M — a silent truncation would produce a scannable code
 * pointing at the wrong report, which is worse than a visible failure.
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text))

  const spec = VERSIONS_M.find((candidate) => {
    const capacityBits = candidate.dataCodewords * 8
    const headerBits = 4 + (candidate.version >= 10 ? 16 : 8)
    return headerBits + bytes.length * 8 <= capacityBits
  })
  if (!spec) throw new Error('محتوى رمز QR أطول من الحد المدعوم.')

  // --- data bitstream ------------------------------------------------------
  const bits: BitBuffer = []
  pushBits(bits, 0b0100, 4) // byte mode
  pushBits(bits, bytes.length, spec.version >= 10 ? 16 : 8)
  for (const byte of bytes) pushBits(bits, byte, 8)

  const capacityBits = spec.dataCodewords * 8
  // Terminator, up to four zero bits, then pad to a byte boundary.
  for (let i = 0; i < 4 && bits.length < capacityBits; i += 1) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const dataCodewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]
    dataCodewords.push(byte)
  }
  // Alternating pad bytes, per spec.
  const padBytes = [0xec, 0x11]
  let padIndex = 0
  while (dataCodewords.length < spec.dataCodewords) {
    dataCodewords.push(padBytes[padIndex % 2])
    padIndex += 1
  }

  // --- split into blocks, add EC, interleave ---------------------------------
  const blocks: number[][] = []
  let offset = 0
  for (const [count, perBlock] of spec.groups) {
    for (let i = 0; i < count; i += 1) {
      blocks.push(dataCodewords.slice(offset, offset + perBlock))
      offset += perBlock
    }
  }
  const ecBlocks = blocks.map((block) => errorCorrection(block, spec.ecCodewordsPerBlock))

  const maxDataPerBlock = Math.max(...blocks.map((block) => block.length))
  const interleaved: number[] = []
  for (let i = 0; i < maxDataPerBlock; i += 1) {
    for (const block of blocks) {
      if (i < block.length) interleaved.push(block[i])
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i += 1) {
    for (const block of ecBlocks) interleaved.push(block[i])
  }

  const finalBits: BitBuffer = []
  for (const byte of interleaved) pushBits(finalBits, byte, 8)

  // --- build the matrix -----------------------------------------------------
  const size = spec.version * 4 + 17
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))

  const setModule = (row: number, col: number, dark: boolean) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return
    modules[row][col] = dark
    reserved[row][col] = true
  }

  // Finder patterns + separators.
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
    for (let row = -1; row <= 7; row += 1) {
      for (let col = -1; col <= 7; col += 1) {
        const inRing =
          (row >= 0 && row <= 6 && (col === 0 || col === 6)) ||
          (col >= 0 && col <= 6 && (row === 0 || row === 6))
        const inCore = row >= 2 && row <= 4 && col >= 2 && col <= 4
        setModule(top + row, left + col, inRing || inCore)
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    setModule(6, i, i % 2 === 0)
    setModule(i, 6, i % 2 === 0)
  }

  // Alignment patterns.
  const centres = ALIGNMENT_CENTRES[spec.version]
  for (const rowCentre of centres) {
    for (const colCentre of centres) {
      // Skip the three corners occupied by finder patterns.
      if ((rowCentre === 6 && colCentre === 6) ||
          (rowCentre === 6 && colCentre === size - 7) ||
          (rowCentre === size - 7 && colCentre === 6)) continue
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2
          setModule(rowCentre + dr, colCentre + dc, isBorder || (dr === 0 && dc === 0))
        }
      }
    }
  }

  // Reserve the format-information areas before placing data, or the data bits
  // will overwrite them.
  const formatCoordsA: Array<[number, number]> = []
  const formatCoordsB: Array<[number, number]> = []
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      formatCoordsA.push([8, i])
      formatCoordsB.push([i, 8])
    }
  }
  for (let i = 0; i < 8; i += 1) {
    formatCoordsA.push([8, size - 1 - i])
    formatCoordsB.push([size - 1 - i, 8])
  }
  for (const [row, col] of [...formatCoordsA, ...formatCoordsB]) reserved[row][col] = true
  // The dark module, always set.
  reserved[size - 8][8] = true
  modules[size - 8][8] = true

  // Version information (versions 7+).
  if (spec.version >= 7) {
    let value = spec.version << 12
    let remainder = spec.version << 12
    for (let i = 0; i < 12; i += 1) {
      // Golay(18,6) generator polynomial 0x1F25.
      if (remainder & (1 << (17 - i))) remainder ^= 0x1f25 << (5 - i)
    }
    value = (spec.version << 12) | (remainder & 0xfff)

    for (let i = 0; i < 18; i += 1) {
      const bit = ((value >> i) & 1) === 1
      const row = Math.floor(i / 3)
      const col = size - 11 + (i % 3)
      modules[row][col] = bit
      reserved[row][col] = true
      modules[col][row] = bit
      reserved[col][row] = true
    }
  }

  // --- place the data, two columns at a time, zig-zag upward -----------------
  let bitIndex = 0
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is skipped entirely.
    if (right === 6) right = 5
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (const col of [right, right - 1]) {
        if (reserved[row][col]) continue
        modules[row][col] = bitIndex < finalBits.length ? finalBits[bitIndex] === 1 : false
        bitIndex += 1
      }
    }
    upward = !upward
  }

  // --- format information --------------------------------------------------
  const formatValue = FORMAT_BITS[EC_LEVEL_M_BITS]
  for (let i = 0; i < 15; i += 1) {
    const bit = ((formatValue >> i) & 1) === 1
    // Copy A: around the top-left finder.
    if (i < 6) modules[8][i] = bit
    else if (i === 6) modules[8][7] = bit
    else if (i === 7) modules[8][8] = bit
    else if (i === 8) modules[7][8] = bit
    else modules[8][14 - i] = bit
  }
  for (let i = 0; i < 8; i += 1) {
    modules[size - 1 - i][8] = ((formatValue >> i) & 1) === 1
  }
  for (let i = 8; i < 15; i += 1) {
    modules[8][size - 15 + i] = ((formatValue >> i) & 1) === 1
  }
  modules[size - 8][8] = true

  return { size, modules }
}
