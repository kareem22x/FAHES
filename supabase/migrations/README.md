# ترحيلات قاعدة بيانات «فاحص»

> ⚠️ **اقرأ هذا قبل تشغيل أي ترحيل.**

## اللحظة الحرجة التي يجب معرفتها

هذا المشروع **لم يُدار بـ`supabase db push` ولا مرة واحدة** قبل 2026-10-03. القاعدة
الحيّة بُنيت **يدويًا** من SQL Editor بشكل انتقائي — لذلك كان جدول تتبّع الترحيلات
نفسه (`supabase_migrations.schema_migrations`) **غير موجود**، وكانت جداول مثل
`inspector_applications` وكل جداول الميدان **غائبة** مع أن الكود يستدعيها.

**لا تستخدم `supabase db push` هنا.** سيحاول إعادة تشغيل الترحيلات من الصفر
ويصطدم بجداول موجودة. الطريقة الصحيحة موثّقة أدناه.

## البنية — كل مهمة في ملف مستقل

| # | الملف | المسؤولية |
|---|---|---|
| 01 | `core_schema.sql` | الجداول الأساسية + الفهارس + RLS + مخزن الوسائط |
| 02 | `core_rpc_functions.sql` | 8 دوال: OTP، الحدود، العروض، الحالة، التقرير |
| 03 | `clerk_identity.sql` | ربط هوية Clerk (الهاتف اختياري) |
| 04 | `inspector_applications.sql` | جدول ودالة تقديم طلب فاحص |
| 05 | `inspection_terms.sql` | إقرار الشروط + وسائط PDF |
| 06 | `admin_audit_logs_view.sql` | عرض سجل التدقيق الإداري |
| 07 | `inspector_device_lock.sql` | قفل جهاز الفاحص + تدقيق أحادي الاتجاه |
| 08 | `field_tables.sql` | جداول الميدان الستة + سياسات RLS التقييدية |
| 09 | `field_functions.sql` | دوال الاستلام والتسليم وتسجيل الإجراء |
| 10 | `rls_deny_by_default.sql` | تصريح الوصول النهائي لكل الجداول |
| 11 | `owner_inspector_view.sql` | ترقية صف المالك لتعمل لوحة الفاحصين |

### الترتيب مهم

الملف `11` يجب أن يُنفَّذ **أخيرًا** — يرقّي صف المالك بعد أن تكون كل البنية قائمة.
لو شغّلته أولًا لنجح، لكن اللوحة ستبقى فارغة.

## طريقة التشغيل

### المعتاد (موصى به)

```bash
export SUPABASE_ACCESS_TOKEN='sbp_…'   # Personal Access Token، ليس service_role
corepack pnpm dlx supabase link --project-ref xaainchpmehfwdezxfwo

# للتشغيل الكامل:
for f in supabase/migrations/*.sql; do
  corepack pnpm dlx supabase db query --linked --file "$f"
done
```

`db query --linked` هو الطريقة الصحيحة: يمرّ عبر Management API، **لا يحتاج
`psql` ولا كلمة مرور قاعدة بيانات ولا Docker**. أما `db query` بلا `--linked`
فيذهب للقاعدة المحلية (Docker/54322) ويفشل.

### بعد تشغيل ترحيل جديد

```bash
corepack pnpm dlx supabase migration repair --status applied <timestamp>
```

## قواعد الكتابة في هذا المجلد

1. **كل ملف idempotent.** استخدم `if not exists`، `create or replace`،
   `drop … if exists`، أو كتلة `do $$` تتحقق من `to_regclass` / `to_regprocedure`.
   كل الملفات في هذا المجلد مُختبرة بتشغيلها مرتين متتاليتين بصفر إخفاقات.
2. **لا تفترض وجود جدول.** القاعدة قد تنقصها جداول من ترحيلات قديمة؛ استخدم
   `if to_regclass(...) is null then continue` قبل أي `alter table`.
3. **`user_profiles` ليس فيه `updated_at`.** الأعمدة الزمنية المتاحة:
   `created_at`, `last_login_at`, `inspector_profile_updated_at`.
4. **GRANT قبل تواقيع الدوال.** اكتب `<sig> text` ثم
   `if to_regprocedure(sig) is null then continue` — انحراف توقيع في دالة واحدة
   كان سيُفشل الملف كله.
5. **لا تعتمد على `db push`.** راجع الأعلى.

## إعادة البناء من الصفر

```bash
# كل ما في هذا المجلد يعمل على قاعدة فارغة بالترتيب التصاعدي.
for f in supabase/migrations/*.sql; do echo "== $f"; corepack pnpm dlx supabase db query --linked --file "$f"; done
```

## النسخ الأصلية

`../migrations_legacy/` يحتفظ بالملفات التسعة الأصلية كما كانت، للرجوع التاريخي.
**لا تُشغَّل — للقراءة فقط.**
