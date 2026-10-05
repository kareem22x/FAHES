import { RouteSkeleton } from '@/components/ui/route-skeleton'

export default function DashboardRequestsLoading() {
  return <RouteSkeleton shape="list" title="طلباتي" rows={4} />
}
