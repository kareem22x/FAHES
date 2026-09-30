'use client'

import { useClerk } from '@clerk/nextjs'

export function LogoutButton() {
  const { signOut } = useClerk()

  async function logout() {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (!response.ok) throw new Error('Could not clear the elevated admin session')
    await signOut({ redirectUrl: '/login' })
  }

  return (
    <button type="button" onClick={logout} className="rounded-full border border-[#0b1f46]/10 bg-white px-4 py-2 text-xs font-bold text-[#56625d]">
      خروج
    </button>
  )
}
