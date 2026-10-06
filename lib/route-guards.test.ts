import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_GUARDS,
  GUARD_EXEMPT_ROUTES,
  PHONE_GATE_EXEMPT,
  PHONE_GATE_PREFIXES,
  PROTECTED_PREFIXES,
  PROXY_ONLY_PREFIXES,
  isPhoneGatedPath,
  isProtectedPath,
  routeFromAppPath,
} from '@/lib/route-guards'

/**
 * The "every dashboard is protected" invariant, enforced against the real tree.
 *
 * The failure this guards against is not hypothetical: a page added under
 * `/admin` or `/inspector` is reachable the moment it exists, and nothing in
 * `tsc`, `eslint` or `next build` notices that no layout guards it. Reading six
 * files and hoping is not a check. Walking `app/` is.
 */

const ROOT = process.cwd()
const APP_DIR = join(ROOT, 'app')

function walk(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found
}

const toAppRelative = (absolute: string) => relative(APP_DIR, absolute).split(sep).join('/')

const allFiles = walk(APP_DIR)
const pageFiles = allFiles.filter((file) => /(^|\/)page\.(tsx|ts|jsx|js)$/.test(toAppRelative(file)))

/** Every layout file between `file`'s directory and the `app/` root, nearest first. */
function ancestorLayouts(file: string): string[] {
  const layouts: string[] = []
  let dir = dirname(file)
  while (dir.startsWith(APP_DIR) && dir !== APP_DIR) {
    for (const name of ['layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js']) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) layouts.push(toAppRelative(candidate))
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return layouts
}

const readAppFile = (appRelative: string) => readFileSync(join(APP_DIR, appRelative), 'utf8')

/**
 * Routes whose own page file calls a session or role guard.
 *
 * `/verify-phone` and `/verify-identity` sit outside the middleware's protected
 * prefixes by design — the phone gate redirects *to* `/verify-phone`, so gating
 * it in the middleware would mean redirecting a user to a route the middleware
 * then bounces. They close themselves instead (`getSession()` then
 * `redirect('/sign-in')`).
 */
const SELF_GUARDED_ROUTES = new Set(
  pageFiles
    .map((file) => ({ appRelative: toAppRelative(file), route: routeFromAppPath(toAppRelative(file)) }))
    .filter((entry): entry is { appRelative: string; route: string } => entry.route !== null)
    .filter((entry) =>
      /\b(getSession|requireSession|requireRoles|requireAdminPage)\s*\(/.test(readAppFile(entry.appRelative)),
    )
    .map((entry) => entry.route),
)

describe('the protection map is internally consistent', () => {
  it('accounts for every protected prefix — as a dashboard or as proxy-only', () => {
    const accounted = [...DASHBOARD_GUARDS.map((guard) => guard.prefix), ...PROXY_ONLY_PREFIXES]
    expect([...PROTECTED_PREFIXES].sort()).toEqual([...accounted].sort())
  })

  it('gives every dashboard a distinct prefix', () => {
    const prefixes = DASHBOARD_GUARDS.map((guard) => guard.prefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it('keeps the phone gate narrower than the auth gate', () => {
    // A phone-gated route that is not even auth-gated would be a contradiction.
    for (const prefix of PHONE_GATE_PREFIXES) {
      expect(PROTECTED_PREFIXES).toContain(prefix)
    }
  })

  it('keeps every phone-gate exemption closed to anonymous visitors', () => {
    // An exempt route is one the gate must not redirect *away* from, so it has
    // to be reachable — but reachable to a signed-in user only. Two legitimate
    // ways to achieve that: the middleware's auth gate, or a guard inside the
    // page itself. `/verify-phone` uses the second, which is why this asserts
    // the outcome rather than the mechanism.
    for (const route of [...GUARD_EXEMPT_ROUTES, ...PHONE_GATE_EXEMPT]) {
      const viaMiddleware = isProtectedPath(route)
      const viaPage = SELF_GUARDED_ROUTES.has(route)
      expect(
        viaMiddleware || viaPage,
        `${route} is neither auth-gated by the middleware nor guarded by its own page`,
      ).toBe(true)
    }
  })
})

describe('prefix matching', () => {
  it('matches the prefix itself and its subtree, but not a lookalike', () => {
    expect(isProtectedPath('/admin')).toBe(true)
    expect(isProtectedPath('/admin/users')).toBe(true)
    // `/administrator` must not be swallowed by the `/admin` prefix.
    expect(isProtectedPath('/administrator')).toBe(false)
    expect(isProtectedPath('/')).toBe(false)
  })

  it('lets the phone-gate exemptions through even though they are auth-gated', () => {
    expect(isProtectedPath('/account')).toBe(true)
    expect(isPhoneGatedPath('/account')).toBe(false)
    expect(isPhoneGatedPath('/admin/gate')).toBe(false)
    expect(isPhoneGatedPath('/dashboard')).toBe(true)
    // Booking a first inspection must not require a verified phone.
    expect(isPhoneGatedPath('/requests')).toBe(false)
  })
})

describe('routeFromAppPath', () => {
  it('drops route groups, which contribute nothing to the URL', () => {
    expect(routeFromAppPath('(admin)/admin/(console)/page.tsx')).toBe('/admin')
  })

  it('collapses a dynamic segment to a single placeholder', () => {
    expect(routeFromAppPath('(admin)/admin/(console)/users/[id]/page.tsx')).toBe('/admin/users/:param')
    expect(routeFromAppPath('sign-in/[[...sign-in]]/page.tsx')).toBe('/sign-in/:param')
  })

  it('ignores files that do not serve a URL', () => {
    expect(routeFromAppPath('dashboard/layout.tsx')).toBe(null)
    expect(routeFromAppPath('dashboard/loading.tsx')).toBe(null)
    expect(routeFromAppPath('api/inspectors/apply/route.ts')).toBe(null)
  })
})

describe('every protected page sits under a guarded layout', () => {
  const protectedPages = pageFiles
    .map((file) => ({ file, appRelative: toAppRelative(file), route: routeFromAppPath(toAppRelative(file)) }))
    .filter((entry): entry is { file: string; appRelative: string; route: string } => entry.route !== null)
    .filter((entry) => isProtectedPath(entry.route))
    .filter((entry) => !GUARD_EXEMPT_ROUTES.includes(entry.route as (typeof GUARD_EXEMPT_ROUTES)[number]))

  it('found protected pages to check', () => {
    // If this drops to zero the assertions below become vacuous.
    expect(protectedPages.length).toBeGreaterThan(20)
  })

  it.each(protectedPages.map((entry) => [entry.route, entry.appRelative, entry.file] as const))(
    'guards %s (%s)',
    (route, _appRelative, file) => {
      const dashboard = DASHBOARD_GUARDS.find(
        (candidate) => route === candidate.prefix || route.startsWith(`${candidate.prefix}/`),
      )

      // `/account` is deliberately proxy-only.
      if (!dashboard) {
        expect(PROXY_ONLY_PREFIXES).toContain(route.split('/').slice(0, 2).join('/'))
        return
      }

      const layouts = ancestorLayouts(file)
      expect(layouts.length).toBeGreaterThan(0)

      const guarded = layouts.filter((layout) => readAppFile(layout).includes(dashboard.guard))
      expect(
        guarded,
        `${route} is under ${dashboard.prefix} but no ancestor layout calls ${dashboard.guard}. Layouts seen: ${layouts.join(', ') || '(none)'}`,
      ).not.toHaveLength(0)
    },
  )
})

describe('every declared dashboard guard is real', () => {
  it.each(DASHBOARD_GUARDS.map((guard) => [guard.prefix, guard.layout, guard.guard] as const))(
    '%s — %s calls %s',
    (_prefix, layout, guard) => {
      const full = join(ROOT, layout)
      expect(existsSync(full), `missing layout file: ${layout}`).toBe(true)
      expect(readFileSync(full, 'utf8')).toContain(guard)
    },
  )
})

describe('the middleware cannot disagree with the map', () => {
  it('imports the prefix lists instead of redeclaring them', () => {
    const proxy = readFileSync(join(ROOT, 'proxy.ts'), 'utf8')
    // A redeclared list is exactly how the gate and this test drift apart.
    expect(proxy).not.toMatch(/const\s+PROTECTED_PREFIXES\s*=/)
    expect(proxy).not.toMatch(/const\s+PHONE_GATE_PREFIXES\s*=/)
    expect(proxy).not.toMatch(/const\s+PHONE_GATE_EXEMPT\s*=/)
    expect(proxy).toContain("from '@/lib/route-guards'")
  })
})
