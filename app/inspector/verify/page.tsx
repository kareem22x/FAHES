import type { Metadata } from 'next'
import InspectorOtpVerification from '@/components/modules/inspector/otp-verification'
import { requireRoles } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'تحقق الفاحص',
  description: 'تحقق برسالة نصية وربط الجوال الميداني بحساب الفاحص.',
}

export default async function InspectorVerifyPage() {
  const session = await requireRoles(['inspector'])
  return <InspectorOtpVerification verifiedPhone={session.phone} />
}
