import AccountProfile from '@/components/modules/account/account-profile'

export const metadata = { title: 'ملفي الشخصي' }

export default function CustomerProfilePage() {
  return (
    <div className="app-page">
      <AccountProfile />
    </div>
  )
}
