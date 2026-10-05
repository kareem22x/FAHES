import { RouteSkeleton } from '@/components/ui/route-skeleton'

export default function DashboardLoading() {
  return <RouteSkeleton shape="cards" title="لوحة العميل" rows={4} />
}
