import 'server-only'
import { e164Saudi } from '@/lib/phone'

/**
 * SMS dispatch.
 *
 * Two providers are supported behind one function:
 *
 *   * `twilio` — used when `OTP_PROVIDER=twilio` and the three TWILIO_* vars are
 *     present. The message is sent through Twilio's REST API with the account
 *     SID and auth token as HTTP Basic credentials.
 *
 *   * `mock` (the default) — logs the message to the server console and reports
 *     success. This is what local development and preview builds run on, so the
 *     whole verification flow is exercisable without a paid SMS account.
 *
 * The caller is responsible for never logging the code itself outside mock mode.
 */

export type SmsProvider = 'twilio' | 'mock'

export type SmsSendResult = {
  ok: boolean
  provider: SmsProvider
  /** Present only when `ok` is false. Safe to log, never shown to the user. */
  error?: string
}

export function smsProvider(): SmsProvider {
  const configured = process.env.OTP_PROVIDER?.trim().toLowerCase()
  if (configured === 'twilio') return 'twilio'
  return 'mock'
}

function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER,
  )
}

async function sendViaTwilio(to: string, body: string): Promise<SmsSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID as string
  const token = process.env.TWILIO_AUTH_TOKEN as string
  const from = process.env.TWILIO_PHONE_NUMBER as string

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return { ok: false, provider: 'twilio', error: `HTTP ${response.status} ${detail.slice(0, 200)}` }
    }
    return { ok: true, provider: 'twilio' }
  } catch (error) {
    return {
      ok: false,
      provider: 'twilio',
      error: error instanceof Error ? error.message : 'unknown transport error',
    }
  }
}

/** Sends `body` to a Saudi mobile number (any format `normalizePhone` accepts). */
export async function sendSms(phone: string, body: string): Promise<SmsSendResult> {
  const to = e164Saudi(phone)
  const provider = smsProvider()

  if (provider === 'twilio' && twilioConfigured()) {
    return sendViaTwilio(to, body)
  }

  // Mock mode — and the deliberate fallback when `twilio` is selected but its
  // credentials are incomplete, so a half-configured environment still works.
  console.info(`[sms:mock] to=${to} body="${body}"`)
  return { ok: true, provider: 'mock' }
}

/** The message body for a verification code. Arabic, matching the product voice. */
export function otpMessage(code: string, expiryMinutes: number): string {
  return `رمز التحقق الخاص بك في فاحص: ${code}. صالح لمدة ${expiryMinutes} دقائق. لا تشاركه مع أي شخص.`
}
