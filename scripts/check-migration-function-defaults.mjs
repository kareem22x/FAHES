/**
 * Guards against a class of error that only shows up on the SECOND run.
 *
 * `create or replace function` may ADD a parameter default but never REMOVE one,
 * and it may never change a parameter name or a return type. So a migration set
 * can run cleanly from scratch and still fail when re-run, if an earlier file
 * defines a function more narrowly than a later one:
 *
 *   02  create or replace function f(a text, b text[])               -- no default
 *   12  create or replace function f(a text, b text[] default null)  -- adds it
 *
 * Forward run: fine. Re-run: file 02 asks to drop the default file 12 added —
 *
 *   ERROR: 42P13: cannot remove parameter defaults from existing function
 *   HINT:  Use DROP FUNCTION f(text,text[]) first.
 *
 * This is exactly what happened to `submit_inspection_offer`, and it is invisible
 * to every other check: the SQL is valid, the schema is valid, and the first run
 * succeeds. Only a re-run fails — the run that matters for a file meant to be
 * pasted onto a database that already exists.
 *
 * ── Why this simulates instead of comparing neighbours ──────────────────────
 *
 * The re-run does not start from an empty database. It starts from the state the
 * set itself left behind, which is the state after the LAST file. So the check
 * cannot walk pairs: `drop function if exists f(text,text[]);` placed before
 * file 02's definition makes file 02 legal again, and a neighbour comparison
 * would still report it as broken.
 *
 * Instead the final state is computed first, then every statement is replayed
 * against a copy of it — which is precisely the sequence of checks PostgreSQL
 * performs on a re-run. A violation here is a violation there.
 *
 * Run: node scripts/check-migration-function-defaults.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = 'supabase/migrations'

/** Reads a balanced `(...)` group starting at the index of its `(`. */
function readParenGroup(sql, openIndex) {
  let depth = 0
  let index = openIndex
  let inSingle = false
  let inLineComment = false

  for (; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }
    if (inSingle) {
      if (char === "'" && next === "'") {
        index += 1
        continue
      }
      if (char === "'") inSingle = false
      continue
    }
    if (char === '-' && next === '-') {
      inLineComment = true
      index += 1
      continue
    }
    if (char === "'") {
      inSingle = true
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return sql.slice(openIndex + 1, index)
    }
  }
  return null
}

/** Splits a parameter list on top-level commas only. */
function splitParams(raw) {
  const parts = []
  let depth = 0
  let current = ''
  let inSingle = false

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if (inSingle) {
      current += char
      if (char === "'" && raw[index + 1] === "'") {
        current += raw[index + 1]
        index += 1
        continue
      }
      if (char === "'") inSingle = false
      continue
    }
    if (char === "'") {
      inSingle = true
      current += char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

const TYPE_KEYWORDS = new Set([
  'text', 'uuid', 'jsonb', 'json', 'numeric', 'int', 'int2', 'int4', 'int8',
  'integer', 'bigint', 'smallint', 'boolean', 'bool', 'timestamptz', 'timestamp',
  'date', 'interval', 'real', 'double', 'varchar', 'character', 'bytea', 'inet',
  'time', 'record', 'void', 'anyelement',
])

/**
 * Splits one parameter into `{ mode, name, type, hasDefault }`.
 *
 * A parameter is `[mode] [name] type [default expr]`. The name is optional, so
 * the only reliable reading is positional: the first token is a name unless it
 * is a known type or mode keyword.
 */
function parseParam(part) {
  const defaultMatch = part.match(/\s+(?:default|=)\s+/i)
  const hasDefault = Boolean(defaultMatch)
  const head = (hasDefault ? part.slice(0, defaultMatch.index) : part).trim()

  const tokens = head.split(/\s+/)
  let mode = null
  if (/^(in|out|inout|variadic)$/i.test(tokens[0])) mode = tokens.shift().toLowerCase()

  let name = null
  if (tokens.length > 1 && /^[a-z_][a-z0-9_]*$/i.test(tokens[0]) && !TYPE_KEYWORDS.has(tokens[0].toLowerCase())) {
    name = tokens.shift()
  }

  return { mode, name, type: tokens.join(' ').toLowerCase().replace(/\s+/g, ' '), hasDefault }
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()

const events = []

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
  const patterns = [
    {
      kind: 'define',
      regex: /create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*|"[^"]+"\.[a-z_][a-z0-9_]*")\s*\(/gi,
    },
    {
      kind: 'drop',
      regex: /drop\s+function\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*|"[^"]+"\.[a-z_][a-z0-9_]*")\s*\(/gi,
    },
  ]

  for (const { kind, regex } of patterns) {
    for (const match of sql.matchAll(regex)) {
      const openIndex = match.index + match[0].length - 1
      const raw = readParenGroup(sql, openIndex)
      if (raw === null) continue

      const qualified = match[1].toLowerCase()
      const params = splitParams(raw).map(parseParam).filter((param) => param.mode !== 'out')

      // `create or replace` refuses a changed return type for the same reason it
      // refuses a removed default, so the two are checked together.
      let returns = null
      if (kind === 'define') {
        const afterGroup = sql.slice(openIndex + raw.length + 2)
        const returnMatch = afterGroup.match(/^\s*returns\s+([^\n]+)/i)
        if (returnMatch) returns = returnMatch[1].trim().toLowerCase().replace(/\s+/g, ' ')
      }

      events.push({
        kind,
        file,
        name: qualified,
        signature: params.map((param) => param.type).join(','),
        key: `${qualified}(${params.map((param) => param.type).join(',')})`,
        params,
        returns,
        position: match.index,
        line: sql.slice(0, match.index).split('\n').length,
      })
    }
  }
}

// One global order: file order first, then position within the file.
const fileOrder = new Map(files.map((file, index) => [file, index]))
events.sort(
  (left, right) => fileOrder.get(left.file) - fileOrder.get(right.file) || left.position - right.position,
)

/**
 * The state the set leaves behind — i.e. what a re-run finds in the database.
 * Drops remove a key; a definition after a drop re-establishes it.
 */
const settled = new Map()
for (const event of events) {
  if (event.kind === 'drop') settled.delete(event.key)
  else settled.set(event.key, event)
}

/** Replay every statement against that state, as PostgreSQL would on a re-run. */
const state = new Map(settled)
const errors = []

for (const event of events) {
  if (event.kind === 'drop') {
    state.delete(event.key)
    continue
  }

  const existing = state.get(event.key)

  if (existing) {
    for (const [index, param] of event.params.entries()) {
      const before = existing.params[index]
      if (!before) continue

      if (before.hasDefault && !param.hasDefault) {
        errors.push(
          `${event.key} — ${event.file}:${event.line} removes the default on parameter ${index + 1} ` +
            `("${param.name ?? `#${index + 1}`}") that ${existing.file}:${existing.line} declares.\n` +
            `        On a re-run the database already holds ${existing.file}'s signature, so PostgreSQL refuses with\n` +
            `          42P13: cannot remove parameter defaults from existing function\n` +
            `        Fix: declare the same default in both, or drop the function by signature first.`,
        )
      }

      if (before.name && param.name && before.name !== param.name) {
        errors.push(
          `${event.key} — ${event.file}:${event.line} renames parameter ${index + 1} from ` +
            `"${before.name}" (${existing.file}:${existing.line}) to "${param.name}".\n` +
            `        PostgreSQL refuses with\n` +
            `          42P13: cannot change name of input parameter\n` +
            `        Fix: drop the function by signature first.`,
        )
      }
    }

    if (existing.returns && event.returns && existing.returns !== event.returns) {
      errors.push(
        `${event.key} — ${event.file}:${event.line} returns "${event.returns}" but ` +
          `${existing.file}:${existing.line} returns "${existing.returns}".\n` +
          `        PostgreSQL refuses with\n` +
          `          42P13: cannot change return type of existing function\n` +
          `        Fix: drop the function by signature first.`,
      )
    }
  }

  state.set(event.key, event)
}

/** Overloads that survive in the final state — the ones a call site can trip on. */
const warnings = []
const byName = new Map()
for (const [key, event] of settled) {
  if (!byName.has(event.name)) byName.set(event.name, [])
  byName.get(event.name).push(key)
}
for (const [name, keys] of byName) {
  if (keys.length < 2) continue
  warnings.push(
    `${name} ends the set with ${keys.length} signatures (${keys.join(' ')}). ` +
      `Legal overloading — but confirm no call site resolves to the wrong one.`,
  )
}

const definitions = events.filter((event) => event.kind === 'define').length
console.log(
  `[check-migration-function-defaults] ${files.length} migrations · ${definitions} definitions · ${settled.size} functions in the final state`,
)

for (const warning of warnings) console.log(`\n  note: ${warning}`)

if (errors.length > 0) {
  console.error(`\n  ${errors.length} problem(s) that break a re-run:\n`)
  for (const error of errors) console.error(`  ✗ ${error}\n`)
  process.exit(1)
}

console.log('\n  ✓ every definition survives a re-run\n')
