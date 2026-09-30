import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  if (session.role !== 'admin' && session.role !== 'admin_pending') redirect('/dashboard')
  return children
}
