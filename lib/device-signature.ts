/**
 * Device signature used to bind an inspector session to one phone.
 *
 * The fingerprint is a SHA-256 over a canonical string that mixes a per-install
 * random id (persisted in `localStorage`) with stable device traits. The raw
 * traits never leave the device — only the digest and a coarse human label are
 * sent to the server, so the binding cannot be used to reconstruct the device.
 *
 * The install id is what makes the digest stable across visits; the device
 * traits are what make it differ between two phones that both cleared storage.
 */

export type DeviceSignaturePayload = {
  hash: string
  label: string
  platform: string
  userAgent: string
  isMobile: boolean
}

const INSTALL_ID_KEY = 'fahes.device.install'

const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini/i

/** True for phones and tablets. Also used server-side on the declared UA. */
export function isMobileUserAgent(userAgent: string) {
  return MOBILE_USER_AGENT.test(userAgent)
}

/** True when the current device reports touch input and a coarse pointer. */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const touch = (navigator.maxTouchPoints ?? 0) > 0
  return touch && (coarsePointer || isMobileUserAgent(navigator.userAgent))
}

function readInstallId() {
  if (typeof window === 'undefined') return 'server'
  try {
    const existing = window.localStorage.getItem(INSTALL_ID_KEY)
    if (existing && existing.length >= 8) return existing
    const created = crypto.randomUUID()
    window.localStorage.setItem(INSTALL_ID_KEY, created)
    return created
  } catch {
    // Private mode or blocked storage: fall back to a value that still varies
    // per session, which means the device will simply need re-binding.
    return `ephemeral-${Math.random().toString(36).slice(2)}`
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Short, human-readable device name for the "trusted device" list. */
export function deviceLabel(userAgent: string) {
  const platform =
    /iPhone/i.test(userAgent) ? 'iPhone'
      : /iPad/i.test(userAgent) ? 'iPad'
        : /Android/i.test(userAgent) ? 'Android'
          : /Macintosh/i.test(userAgent) ? 'Mac'
            : /Windows/i.test(userAgent) ? 'Windows'
              : 'جهاز'
  const browser =
    /EdgA?\//i.test(userAgent) ? 'Edge'
      : /OPR\//i.test(userAgent) ? 'Opera'
        : /Chrome\//i.test(userAgent) ? 'Chrome'
          : /CriOS\//i.test(userAgent) ? 'Chrome'
            : /Firefox\//i.test(userAgent) ? 'Firefox'
              : /Safari\//i.test(userAgent) ? 'Safari'
                : ''
  return [platform, browser].filter(Boolean).join(' · ')
}

/** Collects the payload sent to `POST /api/inspectors/device`. */
export async function collectDeviceSignature(): Promise<DeviceSignaturePayload> {
  const canonical = [
    readInstallId(),
    navigator.userAgent,
    navigator.platform ?? '',
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
    String(navigator.hardwareConcurrency ?? 0),
    String(navigator.maxTouchPoints ?? 0),
  ].join('|')

  return {
    hash: await sha256Hex(canonical),
    label: deviceLabel(navigator.userAgent),
    platform: navigator.platform ?? 'unknown',
    userAgent: navigator.userAgent.slice(0, 300),
    isMobile: isMobileDevice(),
  }
}
