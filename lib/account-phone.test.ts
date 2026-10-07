import { describe, expect, it } from 'vitest'
import {
  PHONE_SAVE_FAILURE_REASONS,
  isPhoneSaveFailureReason,
  phoneSaveErrorBody,
  phoneSaveHttpStatus,
  phoneSaveMessage,
  type PhoneSaveFailureReason,
} from './account-phone'

describe('phoneSaveHttpStatus', () => {
  it('answers a malformed number with 400, not 409', () => {
    // A bad request and a conflicting request are different failures, and the
    // client shows a different sentence for each. Collapsing them was the bug
    // this module exists to make impossible.
    expect(phoneSaveHttpStatus('invalid_phone')).toBe(400)
  })

  it('answers a number held by another account with 409', () => {
    expect(phoneSaveHttpStatus('duplicate')).toBe(409)
  })

  it('answers a vanished user row with 404', () => {
    expect(phoneSaveHttpStatus('not_found')).toBe(404)
  })

  it('answers anything unclassified with 502, because the fault is downstream', () => {
    expect(phoneSaveHttpStatus('unknown')).toBe(502)
  })

  it('gives every reason a status, and no two reasons the same one', () => {
    const statuses = PHONE_SAVE_FAILURE_REASONS.map(phoneSaveHttpStatus)
    expect(statuses.every((status) => Number.isInteger(status) && status >= 400)).toBe(true)
    expect(new Set(statuses).size).toBe(statuses.length)
  })
})

describe('phoneSaveMessage', () => {
  it('writes a distinct sentence per reason, so the message identifies the cause', () => {
    const messages = PHONE_SAVE_FAILURE_REASONS.map(phoneSaveMessage)
    expect(messages.every((message) => message.trim().length > 0)).toBe(true)
    expect(new Set(messages).size).toBe(messages.length)
  })

  it('names the expected shape when the number is malformed', () => {
    expect(phoneSaveMessage('invalid_phone')).toContain('05')
  })

  it('tells the user what to do about a duplicate rather than only that it failed', () => {
    expect(phoneSaveMessage('duplicate')).toContain('الدعم')
  })
})

describe('phoneSaveErrorBody', () => {
  it('carries the same reason it was given, so the client can branch on it', () => {
    for (const reason of PHONE_SAVE_FAILURE_REASONS) {
      expect(phoneSaveErrorBody(reason).reason).toBe(reason)
    }
  })

  it('puts the human sentence in `error` and keeps the two in sync', () => {
    for (const reason of PHONE_SAVE_FAILURE_REASONS) {
      expect(phoneSaveErrorBody(reason).error).toBe(phoneSaveMessage(reason))
    }
  })
})

describe('isPhoneSaveFailureReason', () => {
  it('accepts each declared reason', () => {
    for (const reason of PHONE_SAVE_FAILURE_REASONS) {
      expect(isPhoneSaveFailureReason(reason)).toBe(true)
    }
  })

  it('rejects a near miss, so a typo cannot pass as a known reason', () => {
    expect(isPhoneSaveFailureReason('invalid')).toBe(false)
    expect(isPhoneSaveFailureReason('invalid_phone ')).toBe(false)
    expect(isPhoneSaveFailureReason('DUPLICATE')).toBe(false)
  })

  it('rejects everything that is not a string', () => {
    expect(isPhoneSaveFailureReason(null)).toBe(false)
    expect(isPhoneSaveFailureReason(undefined)).toBe(false)
    expect(isPhoneSaveFailureReason(400)).toBe(false)
    expect(isPhoneSaveFailureReason({ reason: 'duplicate' })).toBe(false)
  })

  it('narrows a string to the union', () => {
    const value: string = 'duplicate'
    if (isPhoneSaveFailureReason(value)) {
      // The annotation is the assertion: this would not compile if the guard
      // did not narrow.
      const narrowed: PhoneSaveFailureReason = value
      expect(narrowed).toBe('duplicate')
    }
  })
})
