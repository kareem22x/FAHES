'use client'

import { motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { LoaderCircle, ShieldAlert, Smartphone } from 'lucide-react'
import { EASE_OUT_EXPO } from '@/components/motion/motion-presets'
import { collectDeviceSignature } from '@/lib/device-signature'

type GuardState = 'checking' | 'ok' | 'blocked'

/**
 * Client-side device lock for the inspector workspace.
 *
 * The server re-checks the device on every sensitive API call, but the shell
 * itself has to be validated from the browser because the fingerprint depends
 * on client-only signals (screen, install id, touch support).
 *
 * The check fails *open* on a network error. Field inspectors work in poor
 * coverage, and locking them out of an app they are already authenticated into
 * would be worse than the risk this guard covers — the API routes remain the
 * hard boundary. A real device mismatch (an explicit 403 from the server) does
 * block the workspace.
 */
export default function InspectorDeviceGuard({
  children,
  ownerView = false,
}: {
  children: ReactNode
  /**
   * Set when the viewer is a platform owner rather than a real inspector. The
   * device lock exists to bind one inspector's account to one phone; an owner
   * reviewing the field dashboard from a desktop is outside that threat model,
   * and the server route agrees (it answers `verified` for them). Skipping the
   * round-trip here avoids showing "هذا الجهاز غير مصرّح" during the window
   * before that response lands.
   *
   * Keyed on *ownership*, not on view mode: the cookie that marks inspector view
   * is only set by the toggle in `/admin`, so an owner who opens the dashboard
   * by URL would otherwise run the desktop-only check and be blocked by it.
   */
  ownerView?: boolean
}) {
  const [state, setState] = useState<GuardState>(ownerView ? 'ok' : 'checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (ownerView) return
    let cancelled = false

    async function check() {
      try {
        const signature = await collectDeviceSignature()
        const response = await fetch('/api/inspectors/device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hash: signature.hash,
            label: signature.label,
            platform: signature.platform,
          }),
        })
        const data: { error?: string } = await response.json()
        if (cancelled) return
        if (!response.ok) {
          setMessage(data.error || 'هذا الجهاز غير مرتبط بحساب الفاحص.')
          setState('blocked')
          return
        }
        setState('ok')
      } catch {
        if (!cancelled) setState('ok')
      }
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [ownerView])

  if (state === 'checking') {
    return (
      <div className="device-guard" role="status" aria-live="polite">
        <LoaderCircle className="size-6 animate-spin" />
        <p>جارٍ التحقق من الجهاز الميداني...</p>
      </div>
    )
  }

  if (state === 'blocked') {
    return (
      <motion.div
        className="device-guard is-blocked"
        role="alert"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
      >
        <span className="device-guard-icon"><ShieldAlert size={26} /></span>
        <h2>هذا الجهاز غير مصرّح</h2>
        <p>{message}</p>
        <p className="device-guard-note">
          <Smartphone size={14} /> يعمل تطبيق الفاحص على الجوال المسجّل فقط. تواصل مع الإدارة لفكّ الارتباط.
        </p>
      </motion.div>
    )
  }

  return children
}
