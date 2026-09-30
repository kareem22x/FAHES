import { requireSession } from '@/lib/auth'

export default async function RequestsLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  return children
}
