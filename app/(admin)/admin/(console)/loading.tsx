import { RouteSkeleton } from '@/components/ui/route-skeleton'

export default function AdminConsoleLoading() {
  return <RouteSkeleton shape="cards" title="لوحة الإدارة" rows={5} />
}
