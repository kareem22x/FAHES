import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { enforceApiRateLimit } from '@/lib/api-rate-limit'
import { parseInspectorApplication } from '@/lib/inspector-application'
import { SupabaseInspectorApplicationsMigrationRequiredError } from '@/lib/supabase/server'
import { getUserById, saveNationalId, submitInspectorApplication } from '@/lib/user-store'

/**
 * The one implementation behind both inspector intake endpoints.
 *
 * `/api/inspectors/apply` and `/api/inspectors/register` differ only in *how the
 * session came to exist* — the sign-up wizard creates the Clerk account in the
 * browser first, the questionnaire assumes one already exists. Everything after
 * that point is the same: same guard, same eligibility rules, same validation,
 * same persistence.
 *
 * Keeping two copies meant two places to forget when a rule changed. The
 * endpoints now stay as thin declarations of their own rate-limit policy, and
 * the behaviour lives here.
 */
export async function handleInspectorIntake(
  request: NextRequest,
  rateLimitKey: string,
): Promise<NextResponse> {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 })

  // An application is reviewed against a reachable phone number, so an account
  // without one cannot be assessed. The gate is explicit rather than implied by
  // the form.
  if (!session.phone) {
    return NextResponse.json(
      { error: 'أضف رقم جوال موثّق إلى حسابك قبل طلب الانضمام كفاحص' },
      { status: 400 },
    )
  }

  const rateLimitResponse = await enforceApiRateLimit(request, rateLimitKey, session.sub, {
    user: 5,
    ip: 10,
    windowMs: 60_000,
  })
  if (rateLimitResponse) return rateLimitResponse

  const applicant = await getUserById(session.sub)
  if (!applicant || applicant.role === 'admin') {
    return NextResponse.json({ error: 'هذا الحساب غير مؤهل للتقديم كفاحص' }, { status: 403 })
  }
  if (applicant.inspectorStatus === 'approved') {
    return NextResponse.json(
      { error: 'حسابك معتمد بالفعل. يمكنك الانتقال إلى لوحة الفاحص.' },
      { status: 409 },
    )
  }
  if (applicant.inspectorStatus === 'suspended') {
    return NextResponse.json(
      { error: 'لا يمكن إرسال طلب جديد لهذا الحساب حاليًا.' },
      { status: 409 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات الطلب غير صالحة' }, { status: 400 })
  }

  const parsed = parseInspectorApplication(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // The national ID is an account-level fact, not merely an application field:
  // `saveNationalId` is what enforces "one ID, one account".
  const nationalIdResult = await saveNationalId(session.sub, parsed.value.nationalId)
  if (!nationalIdResult.ok) {
    if (nationalIdResult.reason === 'duplicate') {
      return NextResponse.json(
        { error: 'رقم الهوية مرتبط بحساب آخر. تواصل مع الدعم للمساعدة.' },
        { status: 409 },
      )
    }
    if (nationalIdResult.reason === 'not_found') {
      return NextResponse.json({ error: 'الحساب غير موجود.' }, { status: 404 })
    }
    return NextResponse.json({ error: 'رقم الهوية غير صالح.' }, { status: 400 })
  }

  try {
    const user = await submitInspectorApplication(session.sub, parsed.value)
    if (!user) return NextResponse.json({ error: 'تعذر تقديم الطلب' }, { status: 400 })
    return NextResponse.json({ success: true, inspectorStatus: user.inspectorStatus })
  } catch (error) {
    if (error instanceof SupabaseInspectorApplicationsMigrationRequiredError) {
      return NextResponse.json(
        {
          error:
            'يلزم تحديث قاعدة البيانات أولًا بتشغيل supabase/migrations/20261006000001_inspector_intake_fields.sql',
        },
        { status: 503 },
      )
    }
    throw error
  }
}
