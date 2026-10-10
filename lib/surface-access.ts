/**
 * القرار النقي في واجهة **العميل** — النظير المفقود لـ`isInspectorSession`.
 *
 * ── العطب الذي يعالجه هذا الملف ────────────────────────────────────────────
 *
 * `lib/field/inspector-access.ts` يوثّق قاعدة: **الحارسان يجب أن يتّفقا**.
 * وُجد هناك لأن `requireRoles` يُدخل المالك على الملكية وحدها، بينما مسارات
 * الميدان كانت تفحص `session.role !== 'inspector'` فيدخل المالك الصفحة ثم
 * يفشل في كل زرّ داخلها.
 *
 * **وهذا بالضبط ما كان يحدث في واجهة العميل، ولم يُصلَح:**
 *
 *   * حرس الصفحة — `requireRoles(['customer'])` في `app/dashboard/layout.tsx`:
 *     `roles.includes('customer')` ⇒ `false` للمالك، ثم `isPlatformOwner` ⇒
 *     `true` ⇒ **يدخل**؛
 *   * وحرس الـAPI — `GET /api/customer/requests`: `session.role !== 'customer'`
 *     ⇒ `true` ⇒ **401**.
 *
 * فالمالك يفتح لوحة العميل فتُرسم، ثم يفشل جلب الطلبات. وفي تطبيق الجوال
 * صار الأثر أسوأ: الشاشة **كلها** طلبات، فيظهر «تعذّر إكمال العملية» بلا
 * أي شيء آخر. والأثر نفسه يقع على أي دور غير `customer` ينادي المسار — وهو
 * ما كان يحدث قبل أن يعرف التطبيق أدواره أصلًا.
 *
 * ── القاعدة ───────────────────────────────────────────────────────────────
 *
 * يجوز استخدام واجهة العميل حين يكون الحساب:
 *
 *   1. `role === 'customer'` — عميل فعلي؛ أو
 *   2. **مالك المنصة** — فوق الأدوار لا داخلها.
 *
 * وهذا ليس توسيعًا: المالك يملك البيانات على الجهة الأخرى من هذه المسارات
 * بحكم التعريف، والفحص بالمُعرّف (Clerk ID) لا يُزوَّر لأنه يُقارَن بهوية
 * Clerk الحيّة. و`admin` غير المالك **مرفوض** — لا خطّ عمل استهلاكي له.
 *
 * ── لماذا لا يُدمج مع `isInspectorSession` ─────────────────────────────────
 *
 * الاثنان يتّفقان في الحالة الواقعية (عميل ⇒ هنا فقط، فاحص ⇒ هناك فقط،
 * مالك ⇒ كلاهما) لكنهما يجيبان سؤالين مختلفين، ودمجهما في دالة واحدة باسم
 * غامض هو الخطوة الأولى لعودة التباعد. يبقى لكل واجهة مسندها المسمّى.
 */

import { isPlatformOwner } from '@/lib/identity-predicates'

/**
 * الجزء من الجلسة الذي يعتمد عليه القرار.
 *
 * بنيوي لا `AppSession`، حتى يبنيه الاختبار من قيمة حرفية، وحتى لا يُلزَم
 * مستدعٍ يملك جلسة ناقصة بالكذب.
 */
export type CustomerAccessSubject = {
  role: string
  phone?: string | null
  clerkUserId?: string | null
}

export function mayUseCustomerSurface(
  session: CustomerAccessSubject | null | undefined,
): boolean {
  if (!session) return false
  if (session.role === 'customer') return true
  return isPlatformOwner({ phone: session.phone, clerkUserId: session.clerkUserId })
}
