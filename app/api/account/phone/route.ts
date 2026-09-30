import { auth as clerkAuth, currentUser as clerkCurrentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { isValidSaudiMobile, normalizePhone } from '@/lib/phone'
import { upsertUserFromClerk } from '@/lib/user-store'

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول إلى حسابك أولًا.' }, { status: 401 })

  const [clerkSession, clerkUser] = await Promise.all([clerkAuth(), clerkCurrentUser()])
  if (!clerkSession.userId || !clerkUser || clerkUser.id !== clerkSession.userId) {
    return NextResponse.json({ error: 'تعذر التحقق من جلسة الحساب.' }, { status: 401 })
  }

  const verifiedPhone = clerkUser.phoneNumbers.find(
    (item) => item.id === clerkUser.primaryPhoneNumberId && item.verification?.status === 'verified',
  ) ?? clerkUser.phoneNumbers.find((item) => item.verification?.status === 'verified')
  if (!verifiedPhone || !isValidSaudiMobile(verifiedPhone.phoneNumber)) {
    return NextResponse.json({ error: 'أكمل التحقق من رقم جوال سعودي في حسابك أولًا.' }, { status: 400 })
  }

  const phone = normalizePhone(verifiedPhone.phoneNumber)
  if (session.phone && session.phone !== phone) {
    return NextResponse.json({ error: 'رقم الجوال الموثق لا يطابق الرقم المرتبط حاليًا بملف الحساب.' }, { status: 409 })
  }

  try {
    await upsertUserFromClerk(
      clerkUser.id,
      phone,
      clerkUser.fullName?.trim() ||
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
        'عميل',
    )
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('Phone number is already linked to another Clerk identity') ||
      error.message.includes('Clerk identity is already linked to another phone number')
    )) {
      return NextResponse.json({ error: 'رقم الجوال مرتبط بملف حساب آخر. تواصل مع الدعم للمساعدة.' }, { status: 409 })
    }
    throw error
  }

  return NextResponse.json({ success: true, phone })
}
