import { requireRoles } from '@/lib/auth'
// The stylesheets live in app/, one level above this layout.
import '../inspector-legibility.css'
import '../field-dashboard.css'

export default async function InspectorLayout({ children }: { children: React.ReactNode }) {
  await requireRoles(['inspector'])
  return children
}
