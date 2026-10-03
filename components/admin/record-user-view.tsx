'use client'

import { useEffect, useRef } from 'react'
import { recordUserViewAction } from '@/lib/admin/actions'

/**
 * Writes one audit entry when an admin opens a user's file.
 *
 * Done from a client effect rather than during the server render: a render
 * side-effect would fire twice under React strict mode and double-log the view.
 * The ref guard also covers Fast Refresh remounts.
 */
export function RecordUserView({ userId }: { userId: string }) {
  const recorded = useRef(false)

  useEffect(() => {
    if (recorded.current) return
    recorded.current = true
    void recordUserViewAction(userId)
  }, [userId])

  return null
}
