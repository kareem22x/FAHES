import { describe, expect, it } from 'vitest'
import {
  MOYASAR_MINIMUM_HALALAS,
  PAYMENT_OUTCOMES,
  fromHalalas,
  isPaidStatus,
  isPaymentOutcome,
  isSettlementStatus,
  mapMoyasarStatus,
  parseWebhookEvent,
  paymentFailureReason,
  paymentMethodKey,
  paymentMethodLabel,
  paymentOutcomeMessage,
  paymentOutcomeTone,
  settlementErrorBody,
  settlementHttpStatus,
  settlementIsSuccess,
  settlementMessage,
  toHalalas,
  verifyWebhookSecret,
  webhookHttpStatus,
  type PaymentOutcome,
  type SettlementStatus,
} from './payment-rules'
// الوحدات الموجّهة للعرض تعيش في `payment-outcomes.ts` (بلا `web-crypto`)
// لأن مكوّن العميل يستوردها. تُختبر من مصدرها لا من إعادة التصدير.
import { paymentAvailabilityCopy, paymentKeyMode, paymentModeNotice } from './payment-outcomes'

describe('toHalalas', () => {
  it('converts a whole riyal amount', () => {
    expect(toHalalas(50)).toBe(5000)
  })

  it('rounds instead of truncating — the floating-point trap', () => {
    // 12.29 * 100 === 1228.9999999999998 in IEEE-754. Truncation sends 1228 and
    // the customer is short one halala on every single payment.
    expect(toHalalas(12.29)).toBe(1229)
    expect(toHalalas(0.07)).toBe(7)
    expect(toHalalas(19.99)).toBe(1999)
  })

  it('rejects an empty string rather than reading it as zero', () => {
    // Number('') is 0, not NaN. Without the explicit guard a blank amount would
    // become a free order.
    expect(toHalalas('')).toBeNull()
    expect(toHalalas('   ')).toBeNull()
  })

  it('accepts a numeric string from PostgREST', () => {
    // `offers.price` is numeric(10,2); PostgREST may hand it back as a string.
    expect(toHalalas('125.50')).toBe(12550)
  })

  it('rejects negative and non-numeric values', () => {
    expect(toHalalas(-1)).toBeNull()
    expect(toHalalas('abc')).toBeNull()
    expect(toHalalas(null)).toBeNull()
    expect(toHalalas(undefined)).toBeNull()
    expect(toHalalas(Number.NaN)).toBeNull()
    expect(toHalalas(Number.POSITIVE_INFINITY)).toBeNull()
    expect(toHalalas({})).toBeNull()
  })

  it('rejects a sub-minimum amount, which is how a unit mix-up surfaces', () => {
    // Passing 50 *riyals* where halalas are expected yields 50, which Moyasar
    // rejects as below its 100-halala floor. The floor is what turns a silent
    // wrong-amount charge into a loud failure.
    expect(MOYASAR_MINIMUM_HALALAS).toBe(100)
    expect(toHalalas(0.5)).toBeLessThan(MOYASAR_MINIMUM_HALALAS)
    expect(toHalalas(50)).toBeGreaterThanOrEqual(MOYASAR_MINIMUM_HALALAS)
  })
})

describe('fromHalalas', () => {
  it('converts back to riyals', () => {
    expect(fromHalalas(5000)).toBe(50)
    expect(fromHalalas(12550)).toBe(125.5)
  })

  it('refuses a non-integer or negative amount', () => {
    expect(fromHalalas(12.5)).toBeNull()
    expect(fromHalalas(-100)).toBeNull()
    expect(fromHalalas('5000')).toBeNull()
    expect(fromHalalas(null)).toBeNull()
  })

  it('round-trips an offer price without drift', () => {
    for (const riyals of [50, 99.99, 150.5, 1234.56, 100000]) {
      const halalas = toHalalas(riyals)
      expect(halalas).not.toBeNull()
      expect(fromHalalas(halalas)).toBeCloseTo(riyals, 2)
    }
  })
})

describe('mapMoyasarStatus', () => {
  it('maps the two statuses we actually see in the form flow', () => {
    expect(mapMoyasarStatus('paid')).toBe('paid')
    expect(mapMoyasarStatus('failed')).toBe('failed')
  })

  it('treats captured and verified as paid — money moved', () => {
    expect(mapMoyasarStatus('captured')).toBe('paid')
    expect(mapMoyasarStatus('verified')).toBe('paid')
  })

  it('does not treat an authorization hold as paid', () => {
    // An authorized payment has not been captured: the funds are only reserved.
    // Calling it paid would hand over the product for free if the capture fails.
    expect(mapMoyasarStatus('authorized')).toBe('initiated')
  })

  it('carries refunded and voided through as their own states', () => {
    expect(mapMoyasarStatus('refunded')).toBe('refunded')
    expect(mapMoyasarStatus('voided')).toBe('voided')
  })

  it('returns null for an unknown status instead of guessing', () => {
    expect(mapMoyasarStatus('disputed')).toBeNull()
    expect(mapMoyasarStatus('')).toBeNull()
    expect(mapMoyasarStatus(null)).toBeNull()
    expect(mapMoyasarStatus(42)).toBeNull()
  })

  it('is case and whitespace insensitive', () => {
    expect(mapMoyasarStatus(' PAID ')).toBe('paid')
  })
})

describe('isPaidStatus', () => {
  it('is true for paid alone', () => {
    expect(isPaidStatus('paid')).toBe(true)
    for (const status of ['unpaid', 'initiated', 'failed', 'refunded', 'voided']) {
      expect(isPaidStatus(status)).toBe(false)
    }
    expect(isPaidStatus(null)).toBe(false)
  })
})

describe('settlement outcomes', () => {
  it('treats already_paid as success, not as an error', () => {
    // Webhooks arrive repeatedly and the return page settles the same payment.
    // Reporting the second one as a failure would make every retry look broken.
    expect(settlementIsSuccess('ok')).toBe(true)
    expect(settlementIsSuccess('already_paid')).toBe(true)
    expect(settlementIsSuccess('amount_mismatch')).toBe(false)
  })

  it('derives HTTP from the reason', () => {
    expect(settlementHttpStatus('ok')).toBe(200)
    expect(settlementHttpStatus('already_paid')).toBe(200)
    expect(settlementHttpStatus('not_found')).toBe(404)
    expect(settlementHttpStatus('amount_mismatch')).toBe(409)
    expect(settlementHttpStatus('no_accepted_offer')).toBe(409)
    expect(settlementHttpStatus('unknown')).toBe(502)
  })

  it('gives every reason its own sentence', () => {
    const messages = new Set<string>()
    for (const status of [
      'ok',
      'already_paid',
      'not_found',
      'no_accepted_offer',
      'amount_mismatch',
      'unknown',
    ] as SettlementStatus[]) {
      const message = settlementMessage(status)
      expect(message.length).toBeGreaterThan(0)
      messages.add(message)
    }
    // Six distinct reasons, six distinct sentences — no generic catch-all
    // swallowing two different failures into one unhelpful line.
    expect(messages.size).toBe(6)
  })

  it('narrows unknown strings', () => {
    expect(isSettlementStatus('amount_mismatch')).toBe(true)
    expect(isSettlementStatus('ok')).toBe(true)
    expect(isSettlementStatus('whatever')).toBe(false)
    expect(isSettlementStatus(null)).toBe(false)
  })

  it('builds the shared error body shape', () => {
    expect(settlementErrorBody('not_found')).toEqual({
      error: settlementMessage('not_found'),
      reason: 'not_found',
    })
  })
})

describe('verifyWebhookSecret', () => {
  const secret = 'mwh_abc123'

  it('accepts the exact secret', () => {
    expect(verifyWebhookSecret(secret, secret)).toBe(true)
  })

  it('rejects a wrong secret', () => {
    expect(verifyWebhookSecret('mwh_abc124', secret)).toBe(false)
    expect(verifyWebhookSecret('mwh_abc12', secret)).toBe(false)
    expect(verifyWebhookSecret('mwh_abc1234', secret)).toBe(false)
  })

  it('fails closed when the server secret is not configured', () => {
    // The dangerous alternative — accepting every webhook when the env var is
    // missing — turns an incomplete deployment into an open door with no signal.
    expect(verifyWebhookSecret(secret, undefined)).toBe(false)
    expect(verifyWebhookSecret(secret, null)).toBe(false)
    expect(verifyWebhookSecret(secret, '')).toBe(false)
    expect(verifyWebhookSecret(secret, '   ')).toBe(false)
  })

  it('rejects a missing or non-string token', () => {
    expect(verifyWebhookSecret(undefined, secret)).toBe(false)
    expect(verifyWebhookSecret(null, secret)).toBe(false)
    expect(verifyWebhookSecret('', secret)).toBe(false)
    expect(verifyWebhookSecret(123, secret)).toBe(false)
    expect(verifyWebhookSecret({}, secret)).toBe(false)
  })

  it('ignores surrounding whitespace on the configured secret only', () => {
    expect(verifyWebhookSecret(secret, `  ${secret}  `)).toBe(true)
    // The received token is compared byte for byte — a padded payload is a
    // different token, not a match.
    expect(verifyWebhookSecret(` ${secret}`, secret)).toBe(false)
  })
})

describe('parseWebhookEvent', () => {
  const validBody = {
    id: 'evt_9f2a',
    type: 'payment_paid',
    created_at: '2026-10-07T12:00:00.000Z',
    secret_token: 'mwh_abc123',
    account_name: 'fahes',
    live: false,
    data: {
      id: 'pay_7c1b',
      status: 'paid',
      amount: 12550,
      currency: 'SAR',
      metadata: { inspection_id: 'FH-2026-ABC12345' },
      source: { type: 'creditcard', company: 'mada', number: '411111XXXXXX1111' },
    },
  }

  it('reads the payment id from data, never from the event id', () => {
    const result = parseWebhookEvent(validBody)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The top-level `id` is the *event* id. Using it would query a payment that
    // does not exist and report a misleading "order not found".
    expect(result.event.paymentId).toBe('pay_7c1b')
    expect(result.event.paymentId).not.toBe(validBody.id)
  })

  it('pulls the inspection id out of metadata', () => {
    const result = parseWebhookEvent(validBody)
    if (!result.ok) throw new Error('expected a parsed event')
    expect(result.event.inspectionId).toBe('FH-2026-ABC12345')
  })

  it('accepts the camelCase metadata key too', () => {
    const result = parseWebhookEvent({
      ...validBody,
      data: { ...validBody.data, metadata: { inspectionId: 'FH-2026-XYZ' } },
    })
    if (!result.ok) throw new Error('expected a parsed event')
    expect(result.event.inspectionId).toBe('FH-2026-XYZ')
  })

  it('reports a missing inspection id as null rather than throwing', () => {
    const result = parseWebhookEvent({ ...validBody, data: { ...validBody.data, metadata: {} } })
    if (!result.ok) throw new Error('expected a parsed event')
    expect(result.event.inspectionId).toBeNull()
  })

  it('normalises the event type to lower case', () => {
    const result = parseWebhookEvent({ ...validBody, type: 'PAYMENT_PAID' })
    if (!result.ok) throw new Error('expected a parsed event')
    expect(result.event.eventType).toBe('payment_paid')
  })

  it('carries the declared status as a hint only', () => {
    const result = parseWebhookEvent(validBody)
    if (!result.ok) throw new Error('expected a parsed event')
    expect(result.event.declaredStatus).toBe('paid')
  })

  it('reads live as a strict boolean', () => {
    expect(parseWebhookEvent(validBody)).toMatchObject({ ok: true, event: { live: false } })
    expect(parseWebhookEvent({ ...validBody, live: true })).toMatchObject({ ok: true, event: { live: true } })
    // Anything that is not literally true is not live — fail towards test mode.
    expect(parseWebhookEvent({ ...validBody, live: 'true' })).toMatchObject({ ok: true, event: { live: false } })
  })

  it('exposes the secret token for the caller to verify', () => {
    const result = parseWebhookEvent(validBody)
    if (!result.ok) throw new Error('expected a parsed event')
    expect(result.event.secretToken).toBe('mwh_abc123')
  })

  it('rejects a body with no data object', () => {
    const result = parseWebhookEvent({ id: 'evt_1', type: 'payment_paid', secret_token: 'x' })
    expect(result).toEqual({ ok: false, reason: 'malformed_body' })
  })

  it('rejects a data object without a payment id', () => {
    const result = parseWebhookEvent({ ...validBody, data: { status: 'paid' } })
    expect(result).toEqual({ ok: false, reason: 'missing_payment_id' })
  })

  it('rejects non-objects', () => {
    for (const raw of [null, undefined, 'a string', 42, [], true]) {
      expect(parseWebhookEvent(raw)).toEqual({ ok: false, reason: 'malformed_body' })
    }
  })

  it('treats a blank payment id as missing', () => {
    expect(parseWebhookEvent({ ...validBody, data: { id: '   ' } })).toEqual({
      ok: false,
      reason: 'missing_payment_id',
    })
  })
})

describe('webhook rejections', () => {
  it('answers a bad secret with 401 so the misconfiguration is visible', () => {
    expect(webhookHttpStatus('invalid_secret')).toBe(401)
  })

  it('answers our own missing config with 500, not 400', () => {
    // The sender did nothing wrong; blaming the request would send the operator
    // looking in the wrong place.
    expect(webhookHttpStatus('not_configured')).toBe(500)
  })

  it('answers a malformed payload with 400', () => {
    expect(webhookHttpStatus('malformed_body')).toBe(400)
    expect(webhookHttpStatus('missing_payment_id')).toBe(400)
  })
})

describe('paymentMethodKey', () => {
  it('prefers the card network over the channel', () => {
    expect(paymentMethodKey({ type: 'creditcard', company: 'mada' })).toBe('mada')
    expect(paymentMethodKey({ type: 'creditcard', company: 'visa' })).toBe('visa')
    expect(paymentMethodKey({ type: 'creditcard', company: 'mastercard' })).toBe('mastercard')
  })

  it('falls back to the wallet channel', () => {
    expect(paymentMethodKey({ type: 'applepay' })).toBe('applepay')
    expect(paymentMethodKey({ type: 'stcpay' })).toBe('stcpay')
  })

  it('falls back to a generic card', () => {
    expect(paymentMethodKey({ type: 'creditcard' })).toBe('card')
  })

  it('returns unknown for a missing or unrecognised source', () => {
    expect(paymentMethodKey(null)).toBe('unknown')
    expect(paymentMethodKey({ type: 'crypto' })).toBe('unknown')
    expect(paymentMethodKey({ company: 'diners' })).toBe('unknown')
  })
})

describe('paymentMethodLabel', () => {
  it('renders Arabic labels for the networks we support', () => {
    expect(paymentMethodLabel('mada')).toBe('مدى')
    expect(paymentMethodLabel('visa')).toBe('فيزا')
  })

  it('never returns an empty label', () => {
    for (const key of ['mada', 'visa', 'mastercard', 'unionpay', 'amex', 'applepay', 'stcpay', 'card']) {
      expect(paymentMethodLabel(key).length).toBeGreaterThan(0)
    }
    expect(paymentMethodLabel('something-new').length).toBeGreaterThan(0)
    expect(paymentMethodLabel(null).length).toBeGreaterThan(0)
  })
})

describe('paymentFailureReason', () => {
  it('prefers the source message', () => {
    expect(paymentFailureReason({ message: 'Insufficient funds' })).toBe('Insufficient funds')
  })

  it('falls back to the second argument', () => {
    expect(paymentFailureReason({}, 'Card declined')).toBe('Card declined')
  })

  it('returns null when there is nothing to show', () => {
    expect(paymentFailureReason(null)).toBeNull()
    expect(paymentFailureReason({}, null)).toBeNull()
    expect(paymentFailureReason({ message: '   ' })).toBeNull()
  })

  it('truncates a very long message', () => {
    const long = 'x'.repeat(500)
    const result = paymentFailureReason({ message: long })
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(300)
    expect(result!.endsWith('…')).toBe(true)
  })
})

describe('payment outcomes', () => {
  it('narrows unknown query values', () => {
    expect(isPaymentOutcome('success')).toBe(true)
    expect(isPaymentOutcome('cancelled')).toBe(true)
    expect(isPaymentOutcome('paid')).toBe(false)
    expect(isPaymentOutcome(null)).toBe(false)
  })

  it('gives every outcome its own sentence', () => {
    const messages = new Set(PAYMENT_OUTCOMES.map((outcome) => paymentOutcomeMessage(outcome)))
    expect(messages.size).toBe(PAYMENT_OUTCOMES.length)
  })

  it('reassures about the lack of a charge on failure and cancellation', () => {
    // The single most important thing a customer needs to read after a failed
    // payment is that no money left their account.
    expect(paymentOutcomeMessage('failed')).toContain('لم يُخصم')
    expect(paymentOutcomeMessage('cancelled')).toContain('لم يُخصم')
  })

  it('maps outcomes to a tone', () => {
    expect(paymentOutcomeTone('success')).toBe('success')
    expect(paymentOutcomeTone('failed')).toBe('error')
    expect(paymentOutcomeTone('invalid')).toBe('error')
    expect(paymentOutcomeTone('pending')).toBe('info')
    expect(paymentOutcomeTone('cancelled')).toBe('info')
  })

  it('covers every declared outcome', () => {
    for (const outcome of PAYMENT_OUTCOMES as readonly PaymentOutcome[]) {
      expect(paymentOutcomeMessage(outcome).length).toBeGreaterThan(0)
    }
  })
})

describe('paymentKeyMode', () => {
  it('recognises the two prefixes Moyasar itself enforces', () => {
    // The library validates /^pk_(test|live)_/ inside init(), so these are not
    // our own convention — they are the only shapes that can work at all.
    expect(paymentKeyMode('pk_test_abc123')).toBe('test')
    expect(paymentKeyMode('pk_live_abc123')).toBe('live')
  })

  it('reports an unconfigured key rather than guessing', () => {
    expect(paymentKeyMode(undefined)).toBe('unconfigured')
    expect(paymentKeyMode(null)).toBe('unconfigured')
    expect(paymentKeyMode('')).toBe('unconfigured')
    expect(paymentKeyMode('   ')).toBe('unconfigured')
    expect(paymentKeyMode('sk_test_secret')).toBe('unconfigured')
    expect(paymentKeyMode('pk_something_else')).toBe('unconfigured')
    expect(paymentKeyMode(42)).toBe('unconfigured')
  })

  it('tolerates surrounding whitespace', () => {
    expect(paymentKeyMode('  pk_live_xyz  ')).toBe('live')
  })

  it('never claims live for a test key', () => {
    // The whole point: public copy must not promise real payments while the
    // deployment is running on test keys.
    expect(paymentKeyMode('pk_test_3Hb7YGNVb4mRarM6p6KuyE6JqN7myGDK4VfAjv2G')).toBe('test')
  })
})

describe('paymentModeNotice', () => {
  it('warns in test mode and stays silent otherwise', () => {
    expect(paymentModeNotice('test')).toContain('تجريبية')
    expect(paymentModeNotice('live')).toBeNull()
    expect(paymentModeNotice('unconfigured')).toBeNull()
  })
})

describe('paymentAvailabilityCopy', () => {
  it('gives a distinct sentence per mode', () => {
    const copy = new Set([
      paymentAvailabilityCopy('live'),
      paymentAvailabilityCopy('test'),
      paymentAvailabilityCopy('unconfigured'),
    ])
    expect(copy.size).toBe(3)
    for (const sentence of copy) expect(sentence.length).toBeGreaterThan(0)
  })

  it('does not advertise live payment when the keys are test keys', () => {
    expect(paymentAvailabilityCopy('test')).not.toContain('متاح الآن')
    expect(paymentAvailabilityCopy('live')).toContain('متاح الآن')
  })
})
