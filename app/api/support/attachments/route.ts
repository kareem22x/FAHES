import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/origin'
import { getSupabaseAdmin } from '@/lib/supabase/server'

/**
 * Mints a short-lived signed upload URL for a support attachment.
 *
 * The `support-attachments` bucket is private, so the browser cannot write to it
 * with the anon key — and must not, because a support screenshot routinely
 * contains a customer's personal data. The service role creates a signed URL for
 * exactly one object path, and the client PUTs the file straight to Storage. The
 * object path is namespaced by the uploader's own id, so a user cannot overwrite
 * someone else's attachment even with a stolen URL.
 */

const MAX_BYTES = 10 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
])

/** Strips path separators and control characters from a user-supplied filename. */
function safeName(name: string): string {
  return name.replace(/[^\w.\-\u0600-\u06FF]/g, '_').slice(-80) || 'attachment'
}

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request)
  if (originError) return originError

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول أولًا.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    name?: unknown
    type?: unknown
    size?: unknown
  } | null

  const name = typeof body?.name === 'string' ? body.name : ''
  const type = typeof body?.type === 'string' ? body.type : 'application/octet-stream'
  const size = typeof body?.size === 'number' ? body.size : 0

  if (!name) return NextResponse.json({ error: 'اسم الملف مطلوب.' }, { status: 400 })
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'حجم الملف يجب أن يكون أقل من ١٠ ميغابايت.' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(type)) {
    return NextResponse.json({ error: 'نوع الملف غير مدعوم.' }, { status: 400 })
  }

  const path = `${session.sub}/${crypto.randomUUID()}-${safeName(name)}`

  const { data, error } = await getSupabaseAdmin()
    .storage.from('support-attachments')
    .createSignedUploadUrl(path)

  if (error || !data) {
    return NextResponse.json(
      { error: 'تعذر تهيئة رفع الملف. تأكد من إعداد مخزن الملفات.', reason: 'storage_unavailable' },
      { status: 503 },
    )
  }

  return NextResponse.json({ ok: true, path: data.path, token: data.token, signedUrl: data.signedUrl })
}

/**
 * Mints a short-lived signed *read* URL for an attachment.
 *
 * A non-admin may only read objects under their own `<userId>/` prefix; an admin
 * may read any, because reviewing the screenshot attached to a ticket is part of
 * answering it.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'سجّل الدخول أولًا.' }, { status: 401 })

  const path = request.nextUrl.searchParams.get('path') ?? ''
  if (!path) return NextResponse.json({ error: 'المسار مطلوب.' }, { status: 400 })

  const isAdmin = session.role === 'admin'
  if (!isAdmin && !path.startsWith(`${session.sub}/`)) {
    return NextResponse.json({ error: 'غير مصرح.' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from('support-attachments')
    .createSignedUrl(path, 300)

  if (error || !data) {
    return NextResponse.json({ error: 'تعذر الوصول إلى الملف.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, url: data.signedUrl })
}
