import { AppSkeleton } from '@/components/ui/route-skeleton'

/**
 * Root-level loading boundary.
 *
 * This sits *above* every layout in the tree, which is the whole point: a
 * segment's own `loading.tsx` renders inside that segment's layout, so it
 * cannot appear until the layout has already finished its session read and
 * first query. For `/dashboard`, `/inspector/*` and `/admin/*` those layouts do
 * the expensive work, so without a boundary up here the previous screen would
 * stay frozen for the entire duration and the skeleton would never be seen.
 */
export default function RootLoading() {
  return <AppSkeleton />
}
