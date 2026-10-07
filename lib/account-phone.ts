/**
 * The mapping from a phone-save failure to its HTTP status and its message.
 *
 * ── Why this is a module and not four lines inside the route ─────────────────
 *
 * The surfaces that save a phone (`/verify-phone`, `/verify-identity`,
 * `/account`) are all `force-dynamic` and sit behind a session, so `tsc`,
 * `eslint` and `next build` pass straight over a wrong status code. A `409`
 * that should have been a `400` never shows up anywhere except in front of a
 * user, as a message that does not match what they did. Keeping the mapping
 * pure puts it inside `vitest`'s reach — `vitest.config.mjs` pins
 * `lib/**\/*.test.ts`, so logic left in a page or a route is logic no test can
 * see.
 *
 * The shape follows the project's error convention: one reason per message,
 * carried in `reason` in the body, with the HTTP status derived from the reason
 * rather than chosen ad hoc at each call site.
 *
 * ── What each reason means ───────────────────────────────────────────────────
 *
 *   invalid_phone  the caller sent something that is not a Saudi mobile. A bad
 *                  request, not a conflict — `400`.
 *   duplicate      the number is already claimed by another account. The write
 *                  is rejected by the unique index on `user_profiles.phone`,
 *                  so this is a state conflict — `409`.
 *   not_found      the session resolved to a user row that no longer exists —
 *                  `404`.
 *   unknown        anything we did not classify. A bad gateway from the app's
 *                  point of view, because the failure is downstream — `502`.
 */

export const PHONE_SAVE_FAILURE_REASONS = [
  'invalid_phone',
  'duplicate',
  'not_found',
  'unknown',
] as const

export type PhoneSaveFailureReason = (typeof PHONE_SAVE_FAILURE_REASONS)[number]

const HTTP_STATUS: Record<PhoneSaveFailureReason, number> = {
  invalid_phone: 400,
  duplicate: 409,
  not_found: 404,
  unknown: 502,
}

const MESSAGE: Record<PhoneSaveFailureReason, string> = {
  invalid_phone: 'أدخل رقم جوال سعودي صحيحًا يبدأ بـ 05 ويتكوّن من 10 أرقام.',
  duplicate: 'رقم الجوال مرتبط بحساب آخر. تواصل مع الدعم الفني للمساعدة.',
  not_found: 'تعذر العثور على ملف حسابك. سجّل الدخول من جديد.',
  unknown: 'تعذر حفظ رقم الجوال الآن. حاول مجددًا بعد قليل.',
}

export function isPhoneSaveFailureReason(value: unknown): value is PhoneSaveFailureReason {
  return (
    typeof value === 'string' &&
    (PHONE_SAVE_FAILURE_REASONS as readonly string[]).includes(value)
  )
}

export function phoneSaveHttpStatus(reason: PhoneSaveFailureReason): number {
  return HTTP_STATUS[reason]
}

export function phoneSaveMessage(reason: PhoneSaveFailureReason): string {
  return MESSAGE[reason]
}

/** The response body for a failure. `reason` is the machine-readable half. */
export function phoneSaveErrorBody(reason: PhoneSaveFailureReason) {
  return { error: MESSAGE[reason], reason }
}
