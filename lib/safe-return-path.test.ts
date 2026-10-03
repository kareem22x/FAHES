import { describe, expect, it } from 'vitest'

import { DEFAULT_POST_AUTH_PATH, safeReturnPath } from '@/lib/safe-return-path'

describe('safeReturnPath', () => {
  it('keeps ordinary same-origin paths', () => {
    expect(safeReturnPath('/dashboard')).toBe('/dashboard')
    expect(safeReturnPath('/requests/new')).toBe('/requests/new')
    expect(safeReturnPath('/auth/complete')).toBe('/auth/complete')
  })

  it('falls back when nothing usable was supplied', () => {
    expect(safeReturnPath(undefined)).toBe(DEFAULT_POST_AUTH_PATH)
    expect(safeReturnPath(null)).toBe(DEFAULT_POST_AUTH_PATH)
    expect(safeReturnPath('')).toBe(DEFAULT_POST_AUTH_PATH)
  })

  it('rejects absolute URLs so /login?next= cannot become an open redirect', () => {
    expect(safeReturnPath('https://evil.example/phish')).toBe(DEFAULT_POST_AUTH_PATH)
    expect(safeReturnPath('http://evil.example')).toBe(DEFAULT_POST_AUTH_PATH)
    expect(safeReturnPath('javascript:alert(1)')).toBe(DEFAULT_POST_AUTH_PATH)
  })

  it('rejects protocol-relative URLs that look like paths', () => {
    expect(safeReturnPath('//evil.example/phish')).toBe(DEFAULT_POST_AUTH_PATH)
    expect(safeReturnPath('///evil.example')).toBe(DEFAULT_POST_AUTH_PATH)
  })

  it('rejects backslashes, which some clients normalise into slashes', () => {
    expect(safeReturnPath('/\\evil.example')).toBe(DEFAULT_POST_AUTH_PATH)
    expect(safeReturnPath('/dashboard\\..\\..')).toBe(DEFAULT_POST_AUTH_PATH)
  })

  it('honours a custom fallback', () => {
    expect(safeReturnPath('//evil.example', '/dashboard')).toBe('/dashboard')
    expect(safeReturnPath(undefined, '/dashboard')).toBe('/dashboard')
  })
})
