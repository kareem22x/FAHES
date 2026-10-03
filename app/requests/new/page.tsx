import SiteHeader from '@/components/site-header'
import NewRequestWizard from '@/components/modules/booking/new-request-wizard'
import '@/app/requests-new.css'

export default function NewRequestPage() {
  return (
    <div className="app-shell is-stacked">
      <SiteHeader navigation={[]} compact ctaLabel="طلباتي" ctaHref="/dashboard" />
      <main dir="rtl" className="app-main">
        <div className="app-content">
          <NewRequestWizard />
        </div>
      </main>
    </div>
  )
}
