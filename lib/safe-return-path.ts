/**
 * Post-authentication destination sanitising.
 *
 * Lives in its own module — free of Clerk and `next/headers` imports — so it can
 * be unit-tested in the node test environment like the rest of `lib/`.
 */

export const DEFAULT_POST_AUTH_PATH = '/auth/complete'

/**
 * Returns `candidate` when it is a safe same-origin path, otherwise `fallback`.
 *
 * `//evil.com` and `/\evil.com` are **protocol-relative** URLs: browsers treat
 * them as absolute, so echoing them into `redirect()` would turn
 * `/login?next=…` into an open redirect. Backslashes are rejected too because
 * some clients normalise `\` to `/`.
 */
export function safeReturnPath(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_POST_AUTH_PATH,
): string {
  if (!candidate || !candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//')) return fallback
  if (candidate.includes('\\')) return fallback
  return candidate
}
