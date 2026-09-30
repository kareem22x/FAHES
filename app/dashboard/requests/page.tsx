import Link from 'next/link'
import { CarFront, Plus } from 'lucide-react'
import RequestCard from '@/components/dashboard/request-card'
import { requireRoles } from '@/lib/auth'
import { getCustomerRequests, summarizeRequests } from '@/lib/customer-data'
import { formatArabicNumber, isActiveStatus } from '@/lib/inspection-status'
import type { StoredInspection } from '@/lib/inspection-store'

type FilterKey = 'all' | 'active' | 'completed' | 'cancelled'

const filters: { key: FilterKey; label: string; match: (request: StoredInspection) => boolean }[] = [
  { key: 'all', label: 'الكل', match: () => true },
  { key: 'active', label: 'نشطة', match: (request) => isActiveStatus(request.status) },
  { key: 'completed', label: 'مكتملة', match: (request) => request.status === 'completed' },
  { key: 'cancelled', label: 'ملغاة', match: (request) => request.status === 'cancelled' },
]

function parseFilter(value: string | undefined): FilterKey {
  return filters.some((filter) => filter.key === value) ? (value as FilterKey) : 'all'
}

export default async function CustomerRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await requireRoles(['customer'])
  const [{ status }, requests] = await Promise.all([
    searchParams,
    getCustomerRequests(session.sub),
  ])

  const active = parseFilter(status)
  const current = filters.find((filter) => filter.key === active) ?? filters[0]
  const visible = requests.filter(current.match)
  const summary = summarizeRequests(requests)
  const counts: Record<FilterKey, number> = {
    all: summary.total,
    active: summary.active,
    completed: summary.completed,
    cancelled: summary.cancelled,
  }

  return (
    <div className="app-page">
      <section className="app-page-head">
        <div>
          <span className="app-eyebrow"><CarFront size={14} /> إدارة الطلبات</span>
          <h2>طلبات الفحص</h2>
          <p>اختر الفاحص من العروض الواردة، وتابع حالة كل طلب خطوة بخطوة حتى استلام التقرير.</p>
        </div>
        <Link href="/requests/new" className="btn btn-primary"><Plus size={17} /> طلب فحص جديد</Link>
      </section>

      <nav className="app-tabs" aria-label="تصفية الطلبات">
        {filters.map((filter) => (
          <Link
            key={filter.key}
            href={filter.key === 'all' ? '/dashboard/requests' : `/dashboard/requests?status=${filter.key}`}
            className={filter.key === active ? 'is-current' : undefined}
            aria-current={filter.key === active ? 'page' : undefined}
          >
            {filter.label}
            <span>{formatArabicNumber(counts[filter.key])}</span>
          </Link>
        ))}
      </nav>

      {visible.length === 0 ? (
        <div className="app-empty is-panel">
          <span><CarFront size={22} /></span>
          <strong>{active === 'all' ? 'ما عندك طلبات فحص حتى الآن' : 'لا توجد طلبات في هذا التصنيف'}</strong>
          <p>
            {active === 'all'
              ? 'أنشئ طلبك الأول، وحدد موقع السيارة ونوع الفحص، وستبدأ عروض الفاحصين بالوصول إليك.'
              : 'جرّب تصنيفًا آخر لرؤية بقية طلباتك.'}
          </p>
          <Link href="/requests/new" className="btn btn-primary btn-sm"><Plus size={16} /> طلب فحص جديد</Link>
        </div>
      ) : (
        <div className="app-request-list stagger-on-view">
          {visible.map((request) => <RequestCard key={request.id} request={request} />)}
        </div>
      )}
    </div>
  )
}
