import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const returnPath = next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : '/auth/complete'
  redirect(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`)
}
