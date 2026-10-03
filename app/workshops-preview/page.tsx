import { WorkshopsMap } from '@/components/ui/workshops-map'

// TEMPORARY verification route — deleted after the component is confirmed.
export default function WorkshopsPreviewPage() {
  return (
    <main className="min-h-screen bg-neutral-900 px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <WorkshopsMap />
      </div>
    </main>
  )
}
