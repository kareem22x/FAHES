/**
 * Builds supabase/FAHES_FULL_SCHEMA.sql — every migration in order, in one file.
 *
 * Run from the repository root:  node scripts/build-full-schema.mjs
 *
 * The migrations are the source of truth and are copied verbatim; this script
 * only orders them and writes the header. Rewriting them here would create a
 * second source of truth, and the two would drift the first time a migration is
 * added without re-running this.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = 'supabase/migrations'
const OUTPUT = 'supabase/FAHES_FULL_SCHEMA.sql'

/** A one-line description per migration, shown in the contents block. */
const DESCRIPTIONS = {
  1: 'المخطط الأساسي: المستخدمون، الطلبات، الفحوصات، التقارير، الوسائط، سجل التدقيق',
  2: 'دوال RPC الأساسية: إنشاء الطلب، قبول العرض، رفع التقرير',
  3: 'ربط الهوية بـ Clerk + التحقق من الهوية الوطنية',
  4: 'جدول طلبات التقديم كفاحص',
  5: 'شروط الفحص',
  6: 'عرض سجل التدقيق للقراءة فقط',
  7: 'قفل الجهاز للفاحص + منع تعديل سجل التدقيق',
  8: 'جداول الميدان: الإجراءات، المواقع، الملاحظات',
  9: 'دوال الميدان',
  10: 'RLS: الرفض افتراضيًا',
  11: 'وضع عرض الفاحص للمالك',
  12: 'تغطية المناطق والعروض',
  13: 'وحدات لوحة الإدارة الأربعون',
  14: 'التحقق من رقم الهوية الوطنية',
  15: 'حزمة الدعم الفني + بوابة الجوال',
  16: 'بوابة رمز التحقق (OTP) للجوال',
  17: 'حقول طلب الفاحص الجديدة (الاسم الثلاثي، الهوية، الجوال، العمر، الخبرة، الشهادات)',
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort()

if (files.length === 0) throw new Error(`No migrations found in ${MIGRATIONS_DIR}`)

const rule = '='.repeat(78)
const contents = files
  .map((name, index) => {
    const ordinal = String(index + 1).padStart(2, '0')
    const description = DESCRIPTIONS[index + 1] ?? ''
    return `--   ${ordinal}/${String(files.length).padStart(2, '0')}  ${name}\n--         ${description}`
  })
  .join('\n')

const header = `-- ${rule}
--  فاحص — المخطط الكامل المتكامل
--  FAHES — complete, integrated database schema
-- ${rule}
--
--  ⚠️  لا تُشغّل هذا الملف مع \`supabase db push\` — قاعدة البيانات بُنيت يدويًا.
--      الصق محتواه في محرر SQL في لوحة Supabase:
--      https://supabase.com/dashboard/project/xaainchmehfwdezxfwo/sql/new
--
--  ✅ آمن للتشغيل أكثر من مرة (idempotent):
--     كل جدول بـ \`create table if not exists\`، وكل فهرس بـ \`if not exists\`،
--     وكل دالة بـ \`create or replace\`، وكل مُشغّل (trigger) يُحذف قبل إنشائه،
--     وكل بيانات أولية بـ \`on conflict do nothing\`، وكل قيد (constraint) داخل
--     كتلة \`do\` تتحقق من \`pg_constraint\` قبل الإضافة، وكل دالة تتغيّر فتراتها
--     الافتراضية أو نوع إرجاعها تُحذف بـ \`drop function if exists\` قبل إعادة تعريفها
--     (لأن PostgreSQL يسمح بإضافة فترة افتراضية ولا يسمح بإزالتها: 42P13).
--     ⇒ تشغيله على قاعدة قائمة لا يغيّر شيئًا، وتشغيله على قاعدة فارغة يبنيها كاملة.
--
--  🔍 إعادة التشغيل مُتحقَّقة آليًّا: \`node scripts/check-migration-function-defaults.mjs\`
--     يحاكي التشغيل الثاني على الحالة التي يتركها الملف، ويفشل إن كان أي تعريف
--     لا ينجو منه. يعمل ضمن \`pnpm build\`.
--
--  ℹ️  التشغيل في محرر SQL يلفّ الملف في معاملة واحدة. إن أردت تشغيله على مراحل،
--      كل قسم يبدأ بسطر \`--  NN/17 — <اسم الملف>\` وهو مستقل وقابل للتشغيل وحده
--      بالترتيب.
--
--  المحتويات (${files.length} ترحيلًا، بالترتيب):
${contents}
--
-- ${rule}

`

const body = files
  .map((name, index) => {
    const ordinal = String(index + 1).padStart(2, '0')
    const description = DESCRIPTIONS[index + 1] ?? ''
    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8').replace(/\s*$/, '')
    return [
      `-- ${rule}`,
      `--  ${ordinal}/${String(files.length).padStart(2, '0')} — ${name}`,
      `--  ${description}`,
      `-- ${rule}`,
      '',
      sql,
      '',
      '',
    ].join('\n')
  })
  .join('\n')

const verification = `-- ${rule}
--  التحقق بعد التشغيل — آخر استعلام هو ما يعرضه محرر SQL
-- ${rule}

-- 1) الجداول المتوقّعة (يجب أن تكون 0 مفقودًا)
with expected(table_name) as (
  values
    ('user_profiles'), ('inspections'), ('inspection_offers'), ('inspection_reports'),
    ('inspection_media'), ('audit_events'), ('inspector_applications'), ('otp_challenges'),
    ('rate_limits'), ('system_settings'), ('support_tickets'), ('support_messages'),
    ('support_canned_responses'), ('field_actions')
)
select
  'الجداول المفقودة' as الفحص,
  coalesce(string_agg(e.table_name, '، '), 'لا شيء ✓') as النتيجة
from expected e
left join information_schema.tables t
  on t.table_schema = 'public' and t.table_name = e.table_name
where t.table_name is null;

-- 2) ملخّص نهائي: أعمدة طلب الفاحص الجديدة + توقيع دالة التقديم
select
  (select count(*) from information_schema.tables where table_schema = 'public') as "جداول public",
  (select count(*) from information_schema.routines where routine_schema = 'public') as "دوال public",
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inspector_applications'
      and column_name in ('full_name', 'national_id', 'phone', 'age', 'experience_details', 'has_certificates')
  ) as "أعمدة الطلب الجديدة (المتوقع 6)",
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_inspector_application'
  ) as "نسخ submit_inspector_application (المتوقع 1)",
  (select count(*) from public.inspector_applications) as "طلبات التقديم الحالية";
`

writeFileSync(OUTPUT, header + body + verification, 'utf8')

const bytes = readFileSync(OUTPUT).length
console.log(`wrote ${OUTPUT}`)
console.log(`  ${files.length} migrations · ${bytes.toLocaleString('en-US')} bytes`)
for (const [index, name] of files.entries()) {
  console.log(`  ${String(index + 1).padStart(2, '0')}  ${name}`)
}
