import { describe, expect, it } from 'vitest'
import { deriveFieldStatus } from './presence'

const claim = (status: string) => ({ claim: { status } })

describe('deriveFieldStatus', () => {
  it('reports inspecting while a job is under way', () => {
    expect(deriveFieldStatus([claim('in_progress')], true)).toBe('inspecting')
  })

  it('reports en route once a job is claimed but not started', () => {
    expect(deriveFieldStatus([claim('claimed')], true)).toBe('en_route')
  })

  it('reports available when online with no claims', () => {
    expect(deriveFieldStatus([], true)).toBe('available')
  })

  it('reports offline when not accepting work, whatever else is true', () => {
    expect(deriveFieldStatus([], false)).toBe('offline')
  })

  it('prefers inspecting over en route when both are present', () => {
    // An inspector running two jobs is working, not travelling — and the console
    // counts this field to decide whether work is in progress.
    expect(deriveFieldStatus([claim('claimed'), claim('in_progress')], true)).toBe('inspecting')
  })

  it('ignores finished claims', () => {
    expect(deriveFieldStatus([claim('completed'), claim('cancelled')], true)).toBe('available')
    expect(deriveFieldStatus([claim('handed_over')], false)).toBe('offline')
  })

  it('ignores orders that are not claimed at all', () => {
    expect(deriveFieldStatus([{ claim: null }, { claim: null }], true)).toBe('available')
  })

  it('stays available for an unknown claim status rather than inventing a state', () => {
    expect(deriveFieldStatus([claim('something_new')], true)).toBe('available')
  })

  it('reports offline for a finished claim when the inspector is off shift', () => {
    // The case that a "just read the last claim" implementation gets wrong: the
    // work ended, so the claim says nothing about whether they are still on.
    expect(deriveFieldStatus([claim('completed')], false)).toBe('offline')
  })
})
