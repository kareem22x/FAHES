import { describe, expect, it } from 'vitest'
import { e164Saudi, isValidSaudiMobile, maskPhone, normalizePhone } from '@/lib/phone'

describe('Saudi mobile numbers', () => {
  it.each(['0551234567', '551234567', '+966551234567', '00966551234567'])(
    'normalizes %s to E.164',
    (phone) => {
      expect(isValidSaudiMobile(phone)).toBe(true)
      expect(e164Saudi(phone)).toBe('+966551234567')
      expect(normalizePhone(phone)).toBe('551234567')
    },
  )

  it.each(['0111234567', '55123456', '9665512345678', ''])(
    'rejects invalid mobile number %s',
    (phone) => {
      expect(isValidSaudiMobile(phone)).toBe(false)
    },
  )

  it('shows when an optional phone number has not been added', () => {
    expect(maskPhone(null)).toBe('غير مضاف')
  })
})
