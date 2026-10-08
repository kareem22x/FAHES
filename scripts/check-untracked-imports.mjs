#!/usr/bin/env node
/**
 * Fail the build when a tracked file imports something git does not track.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * `data/` was listed in .gitignore, but `components/ui/workshops-map.tsx` imports
 * `@/data/workshops`. On a developer machine the file is on disk, so `next build`
 * succeeded. On Vercel the clone only contains tracked files, so the same build
 * died with:
 *
 *     Module not found: Can't resolve '@/data/workshops'
 *
 * Every deployment failed that way for two days, and the local build gave no hint
 * because "exists on disk" and "exists in the repository" are different questions.
 * This script asks the second one, so the failure surfaces locally instead of in CI.
 *
 * Wired as `prebuild`, which pnpm runs automatically before `build`, so both
 * `pnpm build` locally and Vercel's build get the check.
 *
 * ── Fail-safe by design ──────────────────────────────────────────────────────
 *
 * A guard that blocks a healthy build is worse than no guard. Anything unexpected
 * — git missing, not a repository, an unreadable directory, a sandbox that denies
 * child processes — exits 0 with a note. Only a *confirmed* untracked import
 * exits 1.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * Directories that are never part of a deployment.
 *
 * `mobile/` is the React Native app. It is a separate deployment target built by
 * EAS, not by Vercel, so the rule this script enforces — "the Vercel clone only
 * contains tracked files" — does not apply to it. It has to be skipped for a
 * second, sharper reason too: its own `@/…` alias points inside `mobile/`, but
 * this script resolves every specifier against the repo root, so a mobile import
 * would be looked up in the wrong tree and mis-checked.
 */
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'deepseek-harness', '.vercel', '.workbuddy-ai', 'mobile'])

/**
 * True when a tracked path lives inside a skipped tree.
 *
 * Needed separately from `SKIP_DIRS` because the main loop iterates `git
 * ls-files` output, not a directory walk — so skipping the directory alone would
 * still leave every tracked file under it in scope.
 */
function isSkipped(rel) {
  for (const dir of SKIP_DIRS) {
    if (rel.startsWith(`${dir}/`)) return true
  }
  return false
}

const SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx']
const IMPORT_RE = /from\s+['"](@\/[^'"]+)['"]/g

function trackedFiles(root) {
  const out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return new Set(out.split('\n').filter(Boolean))
}

function walk(root, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(root, full, out)
    } else if (entry.isFile()) {
      out.add(relative(root, full).replaceAll('\\', '/'))
    }
  }
}

function findProblems(root) {
  const tracked = trackedFiles(root)

  const onDisk = new Set()
  walk(root, root, onDisk)

  const problems = []
  for (const rel of tracked) {
    if (isSkipped(rel)) continue
    if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) continue

    let source
    try {
      source = readFileSync(join(root, rel), 'utf8')
    } catch {
      continue
    }

    for (const match of source.matchAll(IMPORT_RE)) {
      const target = match[1].slice(2)
      let resolvesTracked = false
      let existsUntracked = false

      for (const suffix of SUFFIXES) {
        const candidate = (target + suffix).replace(/^\//, '')
        if (tracked.has(candidate)) {
          resolvesTracked = true
          break
        }
        if (onDisk.has(candidate)) existsUntracked = true
      }

      if (!resolvesTracked && existsUntracked) problems.push({ rel, spec: match[1] })
    }
  }

  return { problems, trackedCount: tracked.size }
}

const root = resolve(import.meta.dirname, '..')
const TAG = '[check-untracked-imports]'

let result
try {
  result = findProblems(root)
} catch (error) {
  // git absent, not a repository, sandbox denial, unreadable path — never block.
  console.log(`${TAG} skipped (${error?.code ?? error?.name ?? 'error'}).`)
  process.exit(0)
}

if (result.problems.length === 0) {
  console.log(`${TAG} ok — every '@/…' import across ${result.trackedCount} tracked files resolves to a tracked file.`)
  process.exit(0)
}

console.error(`\n${TAG} These imports resolve ONLY to files git does not track.`)
console.error('They build locally and fail on Vercel with "Module not found".\n')
for (const { rel, spec } of result.problems) {
  console.error(`  ${rel}\n      -> ${spec}`)
}
console.error(
  '\nEither commit the target — add a `!path` negation in .gitignore, and note that excluding a\n' +
    'whole directory makes negation impossible, so ignore `dir/*` instead — or stop importing it.\n',
)
process.exit(1)
