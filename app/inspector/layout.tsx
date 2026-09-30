import { requireRoles } from '@/lib/auth'
// The stylesheet lives in app/, one level above this layout.
import '../inspector-legibility.css'

export default async function InspectorLayout({ children }: { children: React.ReactNode }) {
  await requireRoles(['inspector'])
  return children
}
