import { redirect } from 'next/navigation'
import { AdminGateForm } from '@/components/admin-gate-form'
import { requireSession } from '@/lib/auth'

export default async function AdminGatePage() {
  const session = await requireSession()
  if (session.role === 'admin') redirect('/admin')
  if (session.role !== 'admin_pending') redirect('/dashboard')
  return <AdminGateForm />
}
