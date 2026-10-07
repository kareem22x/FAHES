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
| 01 | `20261001000001_core_schema.sql` | الجداول الأساسية + الفهارس + RLS + مخزن الوسائط |
| 02 | `20261001000002_core_rpc_functions.sql` | 8 دوال: OTP، الحدود، العروض، الحالة، التقرير |
| 03 | `20261001000003_clerk_identity.sql` | ربط هوية Clerk (الهاتف اختياري) |
| 04 | `20261001000004_inspector_applications.sql` | جدول ودالة تقديم طلب فاحص |
| 05 | `20261001000005_inspection_terms.sql` | إقرار الشروط + وسائط PDF |
| 06 | `20261001000006_admin_audit_logs_view.sql` | عرض سجل التدقيق الإداري |
| 07 | `20261001000007_inspector_device_lock.sql` | قفل جهاز الفاحص + تدقيق أحادي الاتجاه |
| 08 | `20261001000008_field_tables.sql` | جداول الميدان الستة + سياسات RLS التقييدية |
| 09 | `20261001000009_field_functions.sql` | دوال الاستلام والتسليم وتسجيل الإجراء |
| 10 | `20261001000010_rls_deny_by_default.sql` | تصريح الوصول النهائي لكل الجداول |
| 11 | `20261001000011_owner_inspector_view.sql` | ترقية صف المالك لتعمل لوحة الفاحصين |
| 12 | `20261001000012_region_coverage_and_offers.sql` | تغطية المناطق + العروض |
| 13 | `20261003180000_fahes_admin_40_modules.sql` | وحدات لوحة الإدارة الأربعون |
| 14 | `20261004000000_national_id_verification.sql` | التحقق من رقم الهوية الوطنية |
| 15 | `20261005000000_support_suite_and_phone_gate.sql` | حزمة الدعم الفني + بوابة الجوال |
| 16 | `20261006000000_phone_otp_gate.sql` | بوابة رمز التحقق (OTP) للجوال |
| 17 | `20261006000001_inspector_intake_fields.sql` | حقول طلب الفاحص الجديدة (الاسم الثلاثي، الهوية، الجوال، العمر، الخبرة، الشهادات) |
| 18 | `20261007000000_moyasar_payments.sql` | الدفع الإلكتروني (Moyasar): 7 أعمدة دفع على `inspections` + فهارس + دالة `settle_inspection_payment` |

### الترتيب مهم

الملف `11` يجب أن يُنفَّذ **أخيرًا** — يرقّي صف المالك بعد أن تكون كل البنية قائمة.
لو شغّلته أولًا لنجح، لكن اللوحة ستبقى فارغة.

## الملف الكامل المتكامل

`../FAHES_FULL_SCHEMA.sql` = كل الترتيبات الـ18 أعلاه **بالترتيب** في ملف واحد،
للصق في SQL Editor دفعة واحدة بلا حلقة `for`.

يُبنى آليًّا — **لا يُحرَّر يدويًا**:

```bash
node scripts/build-full-schema.mjs
```

`scripts/build-full-schema.mjs` لا يُعيد كتابة SQL: يقرأ ملفات هذا المجلد **حرفيًا**
ويرتّبها ويضيف ترويسة وفهرسًا واستعلامات تحقق ختامية. إعادة كتابة الـSQL في السكربت
كانت ستُنشئ مصدر حقيقة ثانٍ، وينحرف الاثنان أول مرة يُضاف ترحيل بلا إعادة تشغيل
السكربت. لذلك: **أضفت ترحيلًا جديدًا ⇒ أعد تشغيل السكربت.**

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

### بلا Personal Access Token (الصق يدويًا)

افتح <https://supabase.com/dashboard/project/xaainchmehfwdezxfwo/sql/new> والصق
محتوى `supabase/FAHES_FULL_SCHEMA.sql` كاملًا. آمن على قاعدة قائمة: كل الترتيبات
idempotent، فالملف لا يغيّر شيئًا إن كانت كلها مطبَّقة.

### بعد تشغيل ترحيل جديد

```bash
corepack pnpm dlx supabase migration repair --status applied <timestamp>
```

## قواعد الكتابة في هذا المجلد

1. **كل ملف idempotent.** استخدم `if not exists`، `create or replace`،
   `drop … if exists`، أو كتلة `do $$` تتحقق من `to_regclass` / `to_regprocedure`.
2. **🚨 `create or replace function` لا يسمح بإزالة فترة افتراضية.**
   الإضافة مسموحة، الإزالة لا:
   ```sql
   -- 02
   create or replace function f(a text, b text[])              -- بلا فترة افتراضية
   -- 12
   create or replace function f(a text, b text[] default null) -- أضافها
   ```
   التشغيل **الأول** ينجح. إعادة التشغيل تفشل: الملف 02 يطلب إزالة ما أضافه 12:
   ```
   42P13: cannot remove parameter defaults from existing function
   HINT:  Use DROP FUNCTION f(text,text[]) first.
   ```
   **الحل** — اتبع الـHINT: `drop function if exists f(text,text[]);` قبل التعريف.
   الصلاحيات لا تُفقد لأن كل ملف هنا يمنح `service_role` في حلقة `grant` بعده.
   **لا** تجارِ الفترة الافتراضية في الملف الأقدم: قد يكون جسمه يعتمد على غيابها
   (مثال: `city <> all(null)` تساوي NULL ⇒ تمرير قائمة فارغة يتجاوز الفحص بصمت).
   القاعدة نفسها تنطبق على **تغيير اسم معامل** و**تغيير نوع الإرجاع**.
3. **التحقق آلي** — لا تعتمد على المراجعة:
   ```bash
   node scripts/check-migration-function-defaults.mjs   # أو: corepack pnpm check:migrations
   ```
   يحسب الحالة التي يتركها الملف **ثم يعيد تشغيل كل عبارة عليها** — أي نفس ما يفحصه
   PostgreSQL في التشغيل الثاني — ويفشل إن لم ينجُ أي تعريف. يعمل ضمن `pnpm build`.
   **السبب**: هذه الأخطاء غير مرئية لأي فحص آخر — الـSQL صحيح، والمخطط صحيح،
   والتشغيل الأول ينجح. الفشل في التشغيل الثاني فقط.
4. **لا تفترض وجود جدول.** القاعدة قد تنقصها جداول من ترحيلات قديمة؛ استخدم
   `if to_regclass(...) is null then continue` قبل أي `alter table`.
5. **`user_profiles` ليس فيه `updated_at`.** الأعمدة الزمنية المتاحة:
   `created_at`, `last_login_at`, `inspector_profile_updated_at`.
6. **GRANT قبل تواقيع الدوال.** اكتب `<sig> text` ثم
   `if to_regprocedure(sig) is null then continue` — انحراف توقيع في دالة واحدة
   كان سيُفشل الملف كله.
7. **لا تعتمد على `db push`.** راجع الأعلى.

## إعادة البناء من الصفر

```bash
# كل ما في هذا المجلد يعمل على قاعدة فارغة بالترتيب التصاعدي.
for f in supabase/migrations/*.sql; do echo "== $f"; corepack pnpm dlx supabase db query --linked --file "$f"; done
```

## النسخ الأصلية

`../migrations_legacy/` يحتفظ بالملفات التسعة الأصلية كما كانت، للرجوع التاريخي.
**لا تُشغَّل — للقراءة فقط.**
