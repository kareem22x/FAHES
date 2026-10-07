-- ==============================================================================
--  فاحص — المخطط الكامل المتكامل
--  FAHES — complete, integrated database schema
-- ==============================================================================
--
--  ⚠️  لا تُشغّل هذا الملف مع `supabase db push` — قاعدة البيانات بُنيت يدويًا.
--      الصق محتواه في محرر SQL في لوحة Supabase:
--      https://supabase.com/dashboard/project/xaainchmehfwdezxfwo/sql/new
--
--  ✅ آمن للتشغيل أكثر من مرة (idempotent):
--     كل جدول بـ `create table if not exists`، وكل فهرس بـ `if not exists`،
--     وكل دالة بـ `create or replace`، وكل مُشغّل (trigger) يُحذف قبل إنشائه،
--     وكل بيانات أولية بـ `on conflict do nothing`، وكل قيد (constraint) داخل
--     كتلة `do` تتحقق من `pg_constraint` قبل الإضافة، وكل دالة تتغيّر فتراتها
--     الافتراضية أو نوع إرجاعها تُحذف بـ `drop function if exists` قبل إعادة تعريفها
--     (لأن PostgreSQL يسمح بإضافة فترة افتراضية ولا يسمح بإزالتها: 42P13).
--     ⇒ تشغيله على قاعدة قائمة لا يغيّر شيئًا، وتشغيله على قاعدة فارغة يبنيها كاملة.
--
--  🔍 إعادة التشغيل مُتحقَّقة آليًّا: `node scripts/check-migration-function-defaults.mjs`
--     يحاكي التشغيل الثاني على الحالة التي يتركها الملف، ويفشل إن كان أي تعريف
--     لا ينجو منه. يعمل ضمن `pnpm build`.
--
--  ℹ️  التشغيل في محرر SQL يلفّ الملف في معاملة واحدة. إن أردت تشغيله على مراحل،
--      كل قسم يبدأ بسطر `--  NN/17 — <اسم الملف>` وهو مستقل وقابل للتشغيل وحده
--      بالترتيب.
--
--  المحتويات (18 ترحيلًا، بالترتيب):
--   01/18  20261001000001_core_schema.sql
--         المخطط الأساسي: المستخدمون، الطلبات، الفحوصات، التقارير، الوسائط، سجل التدقيق
--   02/18  20261001000002_core_rpc_functions.sql
--         دوال RPC الأساسية: إنشاء الطلب، قبول العرض، رفع التقرير
--   03/18  20261001000003_clerk_identity.sql
--         ربط الهوية بـ Clerk + التحقق من الهوية الوطنية
--   04/18  20261001000004_inspector_applications.sql
--         جدول طلبات التقديم كفاحص
--   05/18  20261001000005_inspection_terms.sql
--         شروط الفحص
--   06/18  20261001000006_admin_audit_logs_view.sql
--         عرض سجل التدقيق للقراءة فقط
--   07/18  20261001000007_inspector_device_lock.sql
--         قفل الجهاز للفاحص + منع تعديل سجل التدقيق
--   08/18  20261001000008_field_tables.sql
--         جداول الميدان: الإجراءات، المواقع، الملاحظات
--   09/18  20261001000009_field_functions.sql
--         دوال الميدان
--   10/18  20261001000010_rls_deny_by_default.sql
--         RLS: الرفض افتراضيًا
--   11/18  20261001000011_owner_inspector_view.sql
--         وضع عرض الفاحص للمالك
--   12/18  20261001000012_region_coverage_and_offers.sql
--         تغطية المناطق والعروض
--   13/18  20261003180000_fahes_admin_40_modules.sql
--         وحدات لوحة الإدارة الأربعون
--   14/18  20261004000000_national_id_verification.sql
--         التحقق من رقم الهوية الوطنية
--   15/18  20261005000000_support_suite_and_phone_gate.sql
--         حزمة الدعم الفني + بوابة الجوال
--   16/18  20261006000000_phone_otp_gate.sql
--         بوابة رمز التحقق (OTP) للجوال
--   17/18  20261006000001_inspector_intake_fields.sql
--         حقول طلب الفاحص الجديدة (الاسم الثلاثي، الهوية، الجوال، العمر، الخبرة، الشهادات)
--   18/18  20261007000000_moyasar_payments.sql
--         
--
-- ==============================================================================

-- ==============================================================================
--  01/18 — 20261001000001_core_schema.sql
--  المخطط الأساسي: المستخدمون، الطلبات، الفحوصات، التقارير، الوسائط، سجل التدقيق
-- ==============================================================================

-- ============================================================================
-- 01 — المخطط الأساسي: الجداول والفهارس والملكية
-- ----------------------------------------------------------------------------
-- idempotent بالكامل: آمن للتشغيل على قاعدة فارغة أو على قاعدة موجودة جزئيًا.
-- الأعمدة تُضاف بـ`add column if not exists` حتى تلتقط الفروق في قاعدة بُنيت
-- يدويًا (كما هو حال هذا المشروع).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. الجداول
-- ----------------------------------------------------------------------------

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  name text not null default 'عميل',
  role text not null default 'customer'
    check (role in ('customer', 'inspector', 'admin')),
  inspector_status text not null default 'none'
    check (inspector_status in ('none', 'pending', 'approved', 'rejected', 'suspended')),
  inspector_cities text[] not null default '{}',
  is_online boolean not null default false,
  inspector_profile_updated_at timestamptz,
  clerk_user_id text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

-- حقول Clerk تُضاف منفصلة كي لا تفشل على قاعدة قديمة.
alter table public.user_profiles
  add column if not exists clerk_user_id text,
  add column if not exists phone text,
  add column if not exists inspector_profile_updated_at timestamptz;

create table if not exists public.inspections (
  id text primary key,
  customer_id uuid not null references public.user_profiles(id) on delete restrict,
  vehicle jsonb not null,
  city text not null,
  district text not null,
  address text not null,
  services text[] not null check (cardinality(services) > 0),
  scheduled_at timestamptz not null,
  notes text not null default '',
  status text not null default 'open'
    check (status in ('open', 'assigned', 'on_the_way', 'arrived', 'inspecting', 'completed', 'cancelled')),
  assigned_inspector_id uuid references public.user_profiles(id) on delete restrict,
  accepted_offer_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_offers (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(id) on delete cascade,
  inspector_id uuid not null references public.user_profiles(id) on delete restrict,
  inspector_name text not null,
  price numeric(10, 2) not null check (price >= 50 and price <= 100000),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (inspection_id, inspector_id)
);

-- المفتاح الأجنبي للعرض المقبول (يُضاف مرة واحدة فقط).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_accepted_offer_fk'
  ) then
    alter table public.inspections
      add constraint inspections_accepted_offer_fk
      foreign key (accepted_offer_id) references public.inspection_offers(id) on delete restrict;
  end if;
end;
$$;

create table if not exists public.otp_challenges (
  phone text primary key,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  locked_until timestamptz
);

create table if not exists public.rate_limits (
  bucket_hash text primary key,
  hit_count integer not null check (hit_count > 0),
  reset_at timestamptz not null
);

create table if not exists public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null unique references public.inspections(id) on delete cascade,
  inspector_id uuid not null references public.user_profiles(id) on delete restrict,
  checklist jsonb not null default '{}'::jsonb,
  notes text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_media (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(id) on delete cascade,
  inspector_id uuid not null references public.user_profiles(id) on delete restrict,
  object_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  category text not null default ''
    check (category in ('صور خارجية', 'صور داخلية', 'المحرك', 'الشاص', 'الإطارات')),
  original_filename text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.user_profiles(id) on delete set null,
  event_type text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. الفهارس
-- ----------------------------------------------------------------------------

create index if not exists otp_challenges_expiry_idx on public.otp_challenges(expires_at);
create index if not exists rate_limits_reset_idx on public.rate_limits(reset_at);
create index if not exists inspections_customer_created_idx
  on public.inspections(customer_id, created_at desc);
create index if not exists inspections_open_city_schedule_idx
  on public.inspections(city, scheduled_at) where status = 'open';
create index if not exists inspections_assigned_schedule_idx
  on public.inspections(assigned_inspector_id, scheduled_at) where assigned_inspector_id is not null;
create index if not exists inspection_offers_inspection_idx
  on public.inspection_offers(inspection_id, created_at);
create index if not exists inspection_reports_inspector_idx
  on public.inspection_reports(inspector_id, updated_at desc);
create index if not exists inspection_media_inspection_idx
  on public.inspection_media(inspection_id, created_at);
create index if not exists audit_events_resource_idx
  on public.audit_events(resource_type, resource_id, created_at desc);

-- فهرس Clerk الفريد: يُبنى كفهرس جزئي (يتجاهل القيم الفارغة) ليقبل صفوفًا
-- بلا clerk_user_id. مهم أن يكون unique على غير الفارغ فقط، لأن المستخدمين
-- يُنشَؤون أولًا عبر الهاتف ثم يُربطون بـClerk لاحقًا.
create unique index if not exists user_profiles_clerk_user_id_idx
  on public.user_profiles(clerk_user_id)
  where clerk_user_id is not null;

-- ---------------------------------------------------------------------------
-- 3. حراسة الوصول: لا شيء لـanon/authenticated، كل شيء لـservice_role
-- ----------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'user_profiles', 'inspections', 'inspection_offers', 'otp_challenges',
    'rate_limits', 'inspection_reports', 'inspection_media', 'audit_events',
    'inspector_devices'
  ]
  loop
    if to_regclass(format('public.%I', target)) is null then
      raise notice 'skipping missing table: %', target;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public, anon, authenticated', target);
    execute format('grant all on public.%I to service_role', target);
  end loop;
end;
$$;

-- تسلسل سجل التدقيق يحتاج منحة منفصلة.
do $$
begin
  if to_regclass('public.audit_events_id_seq') is not null then
    grant usage, select on sequence public.audit_events_id_seq to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. مخزن الوسائط
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-media',
  'inspection-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ==============================================================================
--  02/18 — 20261001000002_core_rpc_functions.sql
--  دوال RPC الأساسية: إنشاء الطلب، قبول العرض، رفع التقرير
-- ==============================================================================

-- ============================================================================
-- 02 — دوال RPC الأساسية (OTP، الحدود، العروض، الحالة، التقرير)
-- ----------------------------------------------------------------------------
-- كل دوال هذا الملف `create or replace` فتكون idempotent تلقائيًا.
-- الأجسام منقولة حرفيًا من المخطط الأصلي دون تغيير منطقي.
-- ============================================================================

create or replace function public.upsert_user_from_login(p_phone text, p_is_admin boolean)
returns setof public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (phone, name, role, inspector_status, last_login_at)
  values (
    p_phone,
    case when p_is_admin then 'مدير المنصة' else 'عميل' end,
    case when p_is_admin then 'admin' else 'customer' end,
    'none',
    now()
  )
  on conflict (phone) do update
    set last_login_at = now(),
        role = case when p_is_admin then 'admin' else public.user_profiles.role end,
        name = case when p_is_admin and public.user_profiles.name = 'عميل' then 'مدير المنصة' else public.user_profiles.name end;

  return query select * from public.user_profiles where phone = p_phone;
end;
$$;

create or replace function public.verify_otp_challenge(
  p_phone text,
  p_code_hash text,
  p_max_attempts integer,
  p_lock_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge public.otp_challenges%rowtype;
  now_at timestamptz := now();
begin
  select * into challenge
    from public.otp_challenges
    where phone = p_phone
    for update;

  if not found then
    return jsonb_build_object('status', 'missing', 'attempts', 0);
  end if;
  if challenge.locked_until is not null and challenge.locked_until > now_at then
    return jsonb_build_object('status', 'locked', 'attempts', challenge.attempts);
  end if;
  if challenge.expires_at <= now_at then
    delete from public.otp_challenges where phone = p_phone;
    return jsonb_build_object('status', 'expired', 'attempts', challenge.attempts);
  end if;
  if challenge.attempts >= p_max_attempts then
    update public.otp_challenges
      set locked_until = now_at + make_interval(secs => p_lock_ms::double precision / 1000)
      where phone = p_phone;
    return jsonb_build_object('status', 'locked', 'attempts', challenge.attempts);
  end if;
  if challenge.code_hash = p_code_hash then
    delete from public.otp_challenges where phone = p_phone;
    return jsonb_build_object('status', 'valid', 'attempts', challenge.attempts);
  end if;

  update public.otp_challenges
    set attempts = attempts + 1,
        locked_until = case
          when attempts + 1 >= p_max_attempts
            then now_at + make_interval(secs => p_lock_ms::double precision / 1000)
          else locked_until
        end
    where phone = p_phone
    returning attempts into challenge.attempts;
  return jsonb_build_object(
    'status', case when challenge.attempts >= p_max_attempts then 'locked' else 'invalid' end,
    'attempts', challenge.attempts
  );
end;
$$;

create or replace function public.store_otp_challenge(
  p_phone text,
  p_code_hash text,
  p_expiry_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.otp_challenges
    where expires_at < now() - interval '1 day'
      and (locked_until is null or locked_until <= now());

  insert into public.otp_challenges (phone, code_hash, attempts, created_at, expires_at, last_sent_at, locked_until)
  values (p_phone, p_code_hash, 0, now(), now() + make_interval(mins => p_expiry_minutes), now(), null)
  on conflict (phone) do update
    set code_hash = excluded.code_hash,
        attempts = 0,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        last_sent_at = excluded.last_sent_at,
        locked_until = case
          when public.otp_challenges.locked_until > now() then public.otp_challenges.locked_until
          else null
        end;
end;
$$;

create or replace function public.consume_rate_limit(
  p_bucket_hash text,
  p_limit integer,
  p_window_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket public.rate_limits%rowtype;
  now_at timestamptz := now();
begin
  delete from public.rate_limits where reset_at < now_at - interval '1 day';

  insert into public.rate_limits (bucket_hash, hit_count, reset_at)
  values (p_bucket_hash, 1, now_at + make_interval(secs => p_window_ms::double precision / 1000))
  on conflict (bucket_hash) do update
    set hit_count = case
          when public.rate_limits.reset_at <= now_at then 1
          else public.rate_limits.hit_count + 1
        end,
        reset_at = case
          when public.rate_limits.reset_at <= now_at
            then now_at + make_interval(secs => p_window_ms::double precision / 1000)
          else public.rate_limits.reset_at
        end
  returning * into bucket;

  return jsonb_build_object(
    'ok', bucket.hit_count <= p_limit,
    'retryAfterSec', greatest(0, ceil(extract(epoch from (bucket.reset_at - now_at)))::integer)
  );
end;
$$;

-- ── لماذا `drop` قبل `create or replace` هنا ────────────────────────────────
-- الترحيل 12 يعيد تعريف الدالة نفسها ويضيف `default null` على `p_cities`. وهذا
-- يجعل هذا الملف يفشل عند **إعادة التشغيل**: القاعدة تحمل توقيع 12 (بفترة افتراضية)
-- وهذا الملف يطلب إزالتها، وPostgreSQL يرفض ذلك:
--     42P13: cannot remove parameter defaults from existing function
--      HINT: Use DROP FUNCTION submit_inspection_offer(text,uuid,text,numeric,text,text[]) first.
-- الإضافة مسموحة، الإزالة لا. والحل هنا هو ما يقترحه الـHINT نفسه: الحذف أولًا،
-- فيصبح التعريف أدناه غير مشروط بما تركه ملف لاحق. الصلاحيات لا تُفقد: حلقة
-- `grant` في نهاية هذا الملف (قسم الصلاحيات) تمنح `service_role` من جديد.
--
-- البديل — إضافة `default null` هنا لمجاراة 12 — مرفوض: جسم الدالة في هذا
-- الملف يفحص الأهلية بـ`inspection.city <> all(p_cities)`، و`x <> all(null)` تساوي
-- NULL فلا يتحقق الشرط ⇒ تمرير `p_cities` فارغة كان سيتجاوز فحص المدينة بصمت
-- في قاعدة توقّفت عند الترحيل 11.
drop function if exists public.submit_inspection_offer(text, uuid, text, numeric, text, text[]);

create or replace function public.submit_inspection_offer(
  p_inspection_id text,
  p_inspector_id uuid,
  p_inspector_name text,
  p_price numeric,
  p_note text,
  p_cities text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  offer_id uuid;
begin
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if inspection.status <> 'open' then return jsonb_build_object('status', 'closed'); end if;
  if inspection.city <> all(p_cities) then return jsonb_build_object('status', 'forbidden'); end if;
  if not exists (
    select 1 from public.user_profiles
    where id = p_inspector_id
      and role = 'inspector'
      and inspector_status = 'approved'
      and is_online
  ) then return jsonb_build_object('status', 'forbidden'); end if;

  insert into public.inspection_offers (inspection_id, inspector_id, inspector_name, price, note)
  values (p_inspection_id, p_inspector_id, p_inspector_name, p_price, p_note)
  on conflict (inspection_id, inspector_id) do nothing
  returning id into offer_id;

  if offer_id is null then return jsonb_build_object('status', 'duplicate'); end if;
  return jsonb_build_object('status', 'ok', 'offerId', offer_id);
end;
$$;

create or replace function public.accept_inspection_offer(
  p_inspection_id text,
  p_offer_id uuid,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  selected_offer public.inspection_offers%rowtype;
begin
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if inspection.customer_id <> p_customer_id then return jsonb_build_object('status', 'forbidden'); end if;
  if inspection.status <> 'open' then return jsonb_build_object('status', 'closed'); end if;

  select * into selected_offer
    from public.inspection_offers
    where id = p_offer_id and inspection_id = p_inspection_id and status = 'pending'
    for update;
  if not found then return jsonb_build_object('status', 'offer_not_found'); end if;

  update public.inspection_offers
    set status = case when id = p_offer_id then 'accepted' else 'declined' end
    where inspection_id = p_inspection_id;
  update public.inspections
    set status = 'assigned',
        assigned_inspector_id = selected_offer.inspector_id,
        accepted_offer_id = selected_offer.id
    where id = p_inspection_id;

  return jsonb_build_object(
    'status', 'ok',
    'offerId', selected_offer.id,
    'inspectorId', selected_offer.inspector_id,
    'inspectorName', selected_offer.inspector_name,
    'price', selected_offer.price
  );
end;
$$;

create or replace function public.advance_inspection_status(
  p_inspection_id text,
  p_inspector_id uuid,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  expected_next text;
begin
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if inspection.assigned_inspector_id is distinct from p_inspector_id then
    return jsonb_build_object('status', 'forbidden');
  end if;
  expected_next := case inspection.status
    when 'assigned' then 'on_the_way'
    when 'on_the_way' then 'arrived'
    when 'arrived' then 'inspecting'
    else null
  end;
  if expected_next is null or p_next_status <> expected_next then
    return jsonb_build_object('status', 'invalid_transition');
  end if;

  update public.inspections set status = p_next_status where id = p_inspection_id;
  insert into public.audit_events (actor_id, event_type, resource_type, resource_id, metadata)
  values (p_inspector_id, 'inspection.status_changed', 'inspection', p_inspection_id,
    jsonb_build_object('from', inspection.status, 'to', p_next_status));

  return jsonb_build_object('status', 'ok', 'nextStatus', p_next_status);
end;
$$;

create or replace function public.save_inspection_report(
  p_inspection_id text,
  p_inspector_id uuid,
  p_checklist jsonb,
  p_notes text,
  p_submit boolean,
  p_expected_keys text[],
  p_allowed_values text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  item_count integer;
  invalid_count integer;
begin
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if inspection.assigned_inspector_id is distinct from p_inspector_id then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if inspection.status <> 'inspecting' then
    return jsonb_build_object('status', 'inspection_not_active');
  end if;
  if p_checklist is null or jsonb_typeof(p_checklist) is distinct from 'object' or length(p_notes) > 2000 then
    return jsonb_build_object('status', 'invalid_report');
  end if;

  select count(*),
    count(*) filter (where item.key <> all(p_expected_keys) or item.value <> all(p_allowed_values))
    into item_count, invalid_count
    from jsonb_each_text(p_checklist) as item;
  if invalid_count > 0 or item_count > cardinality(p_expected_keys) then
    return jsonb_build_object('status', 'invalid_report');
  end if;
  if p_submit and item_count <> cardinality(p_expected_keys) then
    return jsonb_build_object('status', 'incomplete_report');
  end if;

  insert into public.inspection_reports (inspection_id, inspector_id, checklist, notes, submitted_at, updated_at)
  values (
    p_inspection_id,
    p_inspector_id,
    p_checklist,
    p_notes,
    case when p_submit then now() else null end,
    now()
  )
  on conflict (inspection_id) do update
    set checklist = excluded.checklist,
        notes = excluded.notes,
        submitted_at = case when p_submit then now() else public.inspection_reports.submitted_at end,
        updated_at = now();

  if p_submit then
    update public.inspections set status = 'completed' where id = p_inspection_id;
    insert into public.audit_events (actor_id, event_type, resource_type, resource_id)
    values (p_inspector_id, 'inspection.report_submitted', 'inspection', p_inspection_id);
  else
    insert into public.audit_events (actor_id, event_type, resource_type, resource_id)
    values (p_inspector_id, 'inspection.report_saved', 'inspection', p_inspection_id);
  end if;

  return jsonb_build_object('status', 'ok', 'submitted', p_submit);
end;
$$;

-- ---------------------------------------------------------------------------
-- حراسة التنفيذ
-- ----------------------------------------------------------------------------

do $$
declare
  sig text;
  fns text[] := array[
    'public.upsert_user_from_login(text, boolean)',
    'public.verify_otp_challenge(text, text, integer, bigint)',
    'public.store_otp_challenge(text, text, integer)',
    'public.consume_rate_limit(text, integer, bigint)',
    'public.submit_inspection_offer(text, uuid, text, numeric, text, text[])',
    'public.accept_inspection_offer(text, uuid, uuid)',
    'public.advance_inspection_status(text, uuid, text)',
    'public.save_inspection_report(text, uuid, jsonb, text, boolean, text[], text[])'
  ];
begin
  foreach sig in array fns
  loop
    if to_regprocedure(sig) is null then
      raise notice 'skipping missing function: %', sig;
      continue;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', sig);
    execute format('grant execute on function %s to service_role', sig);
  end loop;
end;
$$;


-- ==============================================================================
--  03/18 — 20261001000003_clerk_identity.sql
--  ربط الهوية بـ Clerk + التحقق من الهوية الوطنية
-- ==============================================================================

-- ============================================================================
-- 03 — هوية Clerk: ربط الحساب وتحديث بيانات الدخول
-- ----------------------------------------------------------------------------
-- يشمل مراجعة «الهاتف اختياري» (20260930175500) التي تلغي اشتراط وجود هاتف
-- سعودي مُوثَّق — لأن حساب المالك يسجّل بالبريد وحده.
-- ============================================================================

alter table public.user_profiles
  add column if not exists clerk_user_id text;

create unique index if not exists user_profiles_clerk_user_id_idx
  on public.user_profiles(clerk_user_id)
  where clerk_user_id is not null;

create or replace function public.upsert_clerk_user(
  p_clerk_user_id text,
  p_phone text,
  p_name text,
  p_is_admin boolean
)
returns setof public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.user_profiles%rowtype;
begin
  if p_clerk_user_id is null or length(p_clerk_user_id) < 1 or length(p_clerk_user_id) > 255
     or (p_phone is not null and p_phone !~ '^5[0-9]{8}$') then
    raise exception 'Invalid Clerk identity or verified Saudi phone number';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fahes:clerk-identity-link', 0));

  select * into profile
    from public.user_profiles
    where clerk_user_id = p_clerk_user_id
    for update;

  if found then
    if p_phone is not null and profile.phone is not null and profile.phone <> p_phone then
      raise exception 'Clerk identity is already linked to another phone number';
    end if;

    update public.user_profiles
      set phone = coalesce(profile.phone, p_phone),
          name = case
            when profile.name = 'عميل' and nullif(btrim(p_name), '') is not null then left(btrim(p_name), 80)
            else profile.name
          end,
          role = case when p_is_admin then 'admin' else profile.role end,
          last_login_at = now()
      where id = profile.id
      returning * into profile;

    return next profile;
    return;
  end if;

  if p_phone is not null then
    select * into profile
      from public.user_profiles
      where phone = p_phone
      for update;

    if found then
      if profile.clerk_user_id is not null and profile.clerk_user_id <> p_clerk_user_id then
        raise exception 'Phone number is already linked to another Clerk identity';
      end if;

      update public.user_profiles
        set clerk_user_id = p_clerk_user_id,
            name = case
              when profile.name = 'عميل' and nullif(btrim(p_name), '') is not null then left(btrim(p_name), 80)
              else profile.name
            end,
            role = case when p_is_admin then 'admin' else profile.role end,
            last_login_at = now()
        where id = profile.id
        returning * into profile;

      return next profile;
      return;
    end if;
  end if;

  insert into public.user_profiles (clerk_user_id, phone, name, role, inspector_status, last_login_at)
  values (
    p_clerk_user_id,
    p_phone,
    case
      when p_is_admin then 'مدير المنصة'
      else coalesce(nullif(left(btrim(p_name), 80), ''), 'عميل')
    end,
    case when p_is_admin then 'admin' else 'customer' end,
    'none',
    now()
  )
  returning * into profile;

  return next profile;
end;
$$;

do $$
begin
  if to_regprocedure('public.upsert_clerk_user(text, text, text, boolean)') is null then
    raise notice 'upsert_clerk_user missing — skipped grants';
    return;
  end if;
  revoke all on function public.upsert_clerk_user(text, text, text, boolean)
    from public, anon, authenticated;
  grant execute on function public.upsert_clerk_user(text, text, text, boolean)
    to service_role;
end;
$$;


-- ==============================================================================
--  04/18 — 20261001000004_inspector_applications.sql
--  جدول طلبات التقديم كفاحص
-- ==============================================================================

-- ============================================================================
-- 04 — طلبات الانضمام كفاحص
-- ----------------------------------------------------------------------------
-- هذا الجدول كان **غائبًا عن القاعدة الحيّة** (تحقّقنا: 42P01 relation
-- "public.inspector_applications" does not exist) مع أن الكود يستدعيه من
-- `app/api/inspectors/apply`. هذا الملف يعيده.
-- ============================================================================

create table if not exists public.inspector_applications (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  experience_years smallint not null check (experience_years between 0 and 60),
  cities text[] not null check (cardinality(cities) between 1 and 18),
  specialties text[] not null check (cardinality(specialties) between 1 and 5),
  qualification text not null default '' check (char_length(qualification) <= 180),
  availability text not null check (availability in ('دوام كامل', 'دوام جزئي', 'حسب المواعيد')),
  has_equipment boolean not null,
  notes text not null default '' check (char_length(notes) <= 1000),
  submitted_at timestamptz not null default now()
);

alter table public.inspector_applications enable row level security;
alter table public.inspector_applications force row level security;
revoke all on public.inspector_applications from public, anon, authenticated;
grant all on public.inspector_applications to service_role;

create or replace function public.submit_inspector_application(
  p_user_id uuid,
  p_experience_years smallint,
  p_cities text[],
  p_specialties text[],
  p_qualification text,
  p_availability text,
  p_has_equipment boolean,
  p_notes text
)
returns setof public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.user_profiles%rowtype;
begin
  select * into profile
    from public.user_profiles
    where id = p_user_id
    for update;

  if not found or profile.role = 'admin' then
    raise exception 'Inspector application is not allowed for this account';
  end if;

  if profile.phone is null or profile.inspector_status not in ('none', 'pending', 'rejected') then
    raise exception 'Inspector application cannot be submitted in the current account state';
  end if;

  insert into public.inspector_applications (
    user_id, experience_years, cities, specialties, qualification,
    availability, has_equipment, notes, submitted_at
  ) values (
    p_user_id, p_experience_years, p_cities, p_specialties, p_qualification,
    p_availability, p_has_equipment, p_notes, now()
  )
  on conflict (user_id) do update set
    experience_years = excluded.experience_years,
    cities = excluded.cities,
    specialties = excluded.specialties,
    qualification = excluded.qualification,
    availability = excluded.availability,
    has_equipment = excluded.has_equipment,
    notes = excluded.notes,
    submitted_at = excluded.submitted_at;

  update public.user_profiles
    set inspector_status = 'pending'
    where id = p_user_id
    returning * into profile;

  insert into public.audit_events (actor_id, event_type, resource_type, resource_id)
  values (p_user_id, 'inspector.application_submitted', 'user', p_user_id::text);

  return next profile;
end;
$$;

do $$
begin
  if to_regprocedure('public.submit_inspector_application(uuid, smallint, text[], text[], text, text, boolean, text)') is null then
    return;
  end if;
  revoke all on function public.submit_inspector_application(uuid, smallint, text[], text[], text, text, boolean, text)
    from public, anon, authenticated;
  grant execute on function public.submit_inspector_application(uuid, smallint, text[], text[], text, text, boolean, text)
    to service_role;
end;
$$;


-- ==============================================================================
--  05/18 — 20261001000005_inspection_terms.sql
--  شروط الفحص
-- ==============================================================================

-- ============================================================================
-- 05 — شروط الفحص + وسائط PDF
-- ----------------------------------------------------------------------------
-- يضيف إقرار الشروط إلى الفحص، ويوسّع أنواع الوسائط لتقبل المستندات (PDF)،
-- ويحدّث قائمة الأنواع المسموحة في مخزن الوسائط.
--
-- مبنيّ idempotent بالكامل: كان الملف الأصلي يفشل على قاعدة تحتوي بعض الأعمدة
-- (`add column` بلا `if not exists`، و`drop constraint` بلا `if exists`).
-- ============================================================================

alter table public.inspections
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

-- الإقرار يجب أن يكون كاملًا أو غائبًا تمامًا.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_terms_consent_pair_check'
  ) then
    alter table public.inspections
      add constraint inspections_terms_consent_pair_check
      check ((terms_version is null) = (terms_accepted_at is null));
  end if;
end;
$$;

alter table public.inspection_media
  add column if not exists original_filename text not null default '';

-- قيد نوع الوسائط: نسقطه ثم نعيد إنشاءه بالنسخة الموسَّعة.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'inspection_media_media_type_check'
       and conrelid = 'public.inspection_media'::regclass
  ) then
    alter table public.inspection_media drop constraint inspection_media_media_type_check;
  end if;
  alter table public.inspection_media
    add constraint inspection_media_media_type_check
    check (media_type in ('image', 'video', 'document'));
exception
  when duplicate_object then null;
end;
$$;

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'application/pdf'
]
where id = 'inspection-media';


-- ==============================================================================
--  06/18 — 20261001000006_admin_audit_logs_view.sql
--  عرض سجل التدقيق للقراءة فقط
-- ==============================================================================

-- ============================================================================
-- 06 — عرض سجل التدقيق الإداري
-- ----------------------------------------------------------------------------
-- NON-DESTRUCTIVE: عرض (view) فقط. لا يُسقط جدولًا ولا يعدّل عمودًا.
-- إعادة التشغيل آمنة (create or replace).
--
-- لماذا عرض لا جدول جديد؟
--   `public.audit_events` موجود وهو أحادي الاتجاه (trigger يرفض UPDATE/DELETE).
--   إنشاء جدول ثانٍ كان سيكرّر البيانات ويضيف مسار كتابة ثانيًا أضعف.
--   هذا العرض يعرض الصفوف نفسها بأسماء الأعمدة التي تتوقّعها لوحة الإدارة:
--
--     اسم المواصفة   ->  العمود الفعلي
--     admin_id       ->  actor_id
--     action_type    ->  event_type
--     target_type    ->  resource_type
--     target_id      ->  resource_id
--     timestamp      ->  created_at
-- ============================================================================

create or replace view public.admin_audit_logs as
select
  id,
  actor_id      as admin_id,
  event_type    as action_type,
  resource_type as target_type,
  resource_id   as target_id,
  metadata,
  created_at    as "timestamp"
from public.audit_events;

comment on view public.admin_audit_logs is
  'Read-only compatibility view over audit_events using the admin_id/action_type/target_id/timestamp naming. Append-only: the underlying table rejects UPDATE and DELETE.';

-- العرض للقراءة فقط لأدوار الـAPI؛ الكتابة تمرّ عبر audit_events ليُطبَّق
-- trigger أحادية الاتجاه دائمًا.
revoke all on public.admin_audit_logs from public, anon, authenticated;
grant select on public.admin_audit_logs to service_role;


-- ==============================================================================
--  07/18 — 20261001000007_inspector_device_lock.sql
--  قفل الجهاز للفاحص + منع تعديل سجل التدقيق
-- ==============================================================================

-- ============================================================================
-- 07 — قفل جهاز الفاحص + سجل تدقيق غير قابل للتعديل
-- ----------------------------------------------------------------------------
-- هذا هو الترحيل 20261001120000 الأصلي، منقوشًا ليكون idempotent (%I + if not
-- exists) ومُوطَّنًا (كل جدول/دالة في مكانه). أُضيف استثناء المالك لدالة الربط
-- حتى يستطيع مالك المنصة فتح لوحة الفاحصين من حاسوبه.
--
-- ⚠️ IMPORTANT: هذا الملف مستقل عن 11 (owner_inspector_dashboard). لو شغّلت
--    الاثنين معًا فآخر ملف يُنفَّذ هو الذي يفوز بتعريف الدالة. الحل النهائي في
--    الملف 11 الذي يعيد تعريف الدالة بنفس النسخة المالك-مستثناة. الترتيب
--    الزمني يضمن أن 11 هو الأخير.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. جدول أجهزة الفاحصين
-- ----------------------------------------------------------------------------

create table if not exists public.inspector_devices (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.user_profiles(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  device_label text not null default '',
  platform text not null default '',
  user_agent text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ربط واحد نشط لكل فاحص؛ ويجوز إعادة تسجيل الجهاز نفسه بعد فكّ الارتباط.
create unique index if not exists inspector_devices_active_binding_idx
  on public.inspector_devices(inspector_id)
  where revoked_at is null;

create index if not exists inspector_devices_lookup_idx
  on public.inspector_devices(inspector_id, device_hash)
  where revoked_at is null;

alter table public.inspector_devices enable row level security;
alter table public.inspector_devices force row level security;
revoke all on public.inspector_devices from public, anon, authenticated;
grant all on public.inspector_devices to service_role;

comment on table public.inspector_devices is
  'الهواتف المرتبطة بفاحص معتمد. صف نشط واحد لكل فاحص (فهرس فريد جزئي). لا يقرأه أو يكتبه إلا service_role.';

-- ---------------------------------------------------------------------------
-- 2. ربط / التحقق من جهاز الفاحص (معاملة واحدة، آمن ضد التزامن)
-- ----------------------------------------------------------------------------

create or replace function public.bind_inspector_device(
  p_inspector_id uuid,
  p_device_hash text,
  p_device_label text,
  p_platform text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.user_profiles%rowtype;
  bound public.inspector_devices%rowtype;
  created_id uuid;
  is_owner boolean;
begin
  -- دفاع في العمق: الـAPI يتحقق أيضًا، لكن قاعدة البيانات هي الخط الأخير
  -- ولا يجوز أن تخزّن بصمة غير مُتحقَّق من صيغتها.
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into profile
    from public.user_profiles
    where id = p_inspector_id;

  if not found then
    return jsonb_build_object('status', 'not_inspector');
  end if;

  -- مالك المنصة يُقرأ من نفس الجدول، بلا أي مصدر خارجي.
  is_owner := profile.role = 'admin';

  if not (
       (profile.role = 'inspector' and profile.inspector_status = 'approved')
       or is_owner
     ) then
    return jsonb_build_object('status', 'not_inspector');
  end if;

  -- هاتفان يتسابقان على حساب الفاحص نفسه لا يجوز أن يفوزا معًا.
  perform pg_advisory_xact_lock(
    hashtextextended('fahes:inspector-device:' || p_inspector_id::text, 0)
  );

  select * into bound
    from public.inspector_devices
    where inspector_id = p_inspector_id
      and device_hash = p_device_hash
      and revoked_at is null
    for update;

  if found then
    update public.inspector_devices
      set last_seen_at = now(),
          device_label = coalesce(nullif(left(p_device_label, 80), ''), device_label),
          platform = coalesce(nullif(left(p_platform, 80), ''), platform),
          user_agent = left(coalesce(p_user_agent, ''), 300)
      where id = bound.id;

    return jsonb_build_object('status', 'verified', 'deviceId', bound.id);
  end if;

  -- أي جهاز نشط آخر يعني أن الحساب مقفل على جهاز غيره — إلا للمالك.
  select * into bound
    from public.inspector_devices
    where inspector_id = p_inspector_id
      and revoked_at is null
    order by first_seen_at
    limit 1;

  if found and not is_owner then
    return jsonb_build_object(
      'status', 'device_mismatch',
      'boundLabel', coalesce(nullif(bound.device_label, ''), 'جهاز آخر')
    );
  end if;

  insert into public.inspector_devices (inspector_id, device_hash, device_label, platform, user_agent)
  values (
    p_inspector_id,
    p_device_hash,
    left(coalesce(p_device_label, ''), 80),
    left(coalesce(p_platform, ''), 80),
    left(coalesce(p_user_agent, ''), 300)
  )
  returning id into created_id;

  return jsonb_build_object('status', 'bound', 'deviceId', created_id);
end;
$$;

revoke all on function public.bind_inspector_device(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bind_inspector_device(uuid, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. فكّ ارتباط الجهاز (إداري فقط، مُدقَّق)
-- ----------------------------------------------------------------------------

create or replace function public.revoke_inspector_device(
  p_inspector_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_count integer;
begin
  if not exists (
    select 1 from public.user_profiles
    where id = p_actor_id and role = 'admin'
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  update public.inspector_devices
    set revoked_at = now()
    where inspector_id = p_inspector_id
      and revoked_at is null;
  get diagnostics revoked_count = row_count;

  insert into public.audit_events (actor_id, event_type, resource_type, resource_id, metadata)
  values (
    p_actor_id,
    'inspector.device_revoked',
    'user',
    p_inspector_id::text,
    jsonb_build_object('revoked', revoked_count)
  );

  return jsonb_build_object('status', 'ok', 'revoked', revoked_count);
end;
$$;

revoke all on function public.revoke_inspector_device(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_inspector_device(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. جعل سجل التدقيق غير قابل للتعديل فعلًا (لا مجرد عُرف)
-- ----------------------------------------------------------------------------

create or replace function public.audit_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists audit_events_no_mutation on public.audit_events;
create trigger audit_events_no_mutation
  before update or delete on public.audit_events
  for each row execute function public.audit_events_append_only();


-- ==============================================================================
--  08/18 — 20261001000008_field_tables.sql
--  جداول الميدان: الإجراءات، المواقع، الملاحظات
-- ==============================================================================

-- ============================================================================
-- 08 — عمليات الفاحص الميداني: الجداول والفهارس والقواعد
-- ----------------------------------------------------------------------------
-- الجداول التي كانت **غائبة عن القاعدة الحيّة** (تحقّقنا: 8 جداول فقط موجودة،
-- وكل جداول الميدان مفقودة): inspector_claims, field_actions,
-- inspector_support_tickets, inspector_handover_requests, inspector_badges,
-- inspector_payout_requests — إضافة إلى أعمدة الربط على inspection_media.
-- ============================================================================

-- ============================================================================
-- Inspector field operations — claim, custody, handover, support.
-- ----------------------------------------------------------------------------
-- This migration adds the tables a field inspector needs when they are standing
-- in a showroom with a phone, not sitting at a desk:
--
--   inspector_claims            one row per inspect-a-vehicle job the inspector
--                               has taken. Separate from `inspections` because a
--                               single order can legitimately be re-claimed after
--                               a handover, and a claim, not an order, is what
--                               the inspector actually works against.
--   field_actions               append-only legal audit trail. Every field event
--                               carries an RFC3339 timestamp, exact GPS, the
--                               inspector id, and a SHA-256 hash chained to the
--                               previous action on the same claim. A row can be
--                               inserted and never updated or deleted.
--   inspector_support_tickets   field support / dispute intake.
--   inspector_handover_requests shift swap requests.
--   inspector_badges            professional recognition.
--
-- Two columns are added to `inspection_media` so a photo can be tied to the
-- verification phase and carry the GPS where it was taken. The CHECK constraint
-- on `category` is widened to accept the legal multi-angle set, because the
-- original set only had five body-area categories and the legal requirement is
-- a specific four-shot sequence (vehicle, showroom signboard, inspection paper).
--
-- Everything is idempotent (`if not exists` / `drop … if exists` before create)
-- so it can be re-run against a database that already has part of it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Claim — one inspector, one vehicle, at most one live claim.
-- ---------------------------------------------------------------------------

create table if not exists public.inspector_claims (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(id) on delete cascade,
  inspector_id uuid not null references public.user_profiles(id) on delete restrict,
  city text not null,
  status text not null default 'claimed'
    check (status in ('claimed', 'in_progress', 'completed', 'cancelled', 'handed_over')),

  -- When the inspector pressed "claim" — with where they were standing.
  claimed_at timestamptz not null default now(),
  claim_lat double precision,
  claim_lng double precision,
  claim_accuracy_m double precision,
  -- Distance in metres between the inspector and the vehicle at claim time. NULL
  -- when either side had no coordinates; never treated as "0" by the UI.
  claim_distance_m double precision,

  -- Pre-inspection verification.
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  plate_confirmed boolean not null default false,
  verification_completed_at timestamptz,

  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text
    check (cancel_reason is null or cancel_reason in (
      'vehicle_missing', 'vehicle_sold', 'showroom_denied', 'location_mismatch',
      'safety_concern', 'other'
    )),
  cancel_note text not null default '',

  handed_over_to uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The concurrency guard, expressed as data rather than as application logic:
-- a vehicle order can have many historical claims (handovers, cancellations)
-- but only one that is still live. Two inspectors hitting "claim" at the same
-- millisecond is impossible to resolve correctly in the client, so the database
-- refuses the second one outright.
create unique index if not exists inspector_claims_one_live_per_inspection
  on public.inspector_claims (inspection_id)
  where status in ('claimed', 'in_progress');

create index if not exists inspector_claims_inspector_live
  on public.inspector_claims (inspector_id, status);

create index if not exists inspector_claims_city_open
  on public.inspector_claims (city, status);

-- ---------------------------------------------------------------------------
-- 2. Field actions — the append-only chain of custody.
-- ---------------------------------------------------------------------------

create table if not exists public.field_actions (
  id bigint generated always as identity primary key,
  claim_id uuid not null references public.inspector_claims(id) on delete cascade,
  inspection_id text not null references public.inspections(id) on delete cascade,
  inspector_id uuid not null references public.user_profiles(id) on delete restrict,

  action_type text not null
    check (action_type in (
      'claim', 'verify', 'start', 'status_change', 'media_upload', 'media_delete',
      'report_save', 'report_submit', 'cancel', 'handover_request',
      'handover_accept', 'sync', 'note'
    )),
  -- Free-form because the enum above is the *category*; this is the detail,
  -- e.g. a status transition or the media category that was uploaded.
  action_detail text not null default '',

  -- RFC3339 with an offset, stored as timestamptz. The string form is kept too
  -- so the archive can render exactly what the device recorded, even if the
  -- row is later exported by a tool with a different timezone default.
  recorded_at timestamptz not null default now(),
  recorded_at_rfc3339 text not null,
  -- Millisecond clock on the device. Wall-clock time can be edited by the
  -- handset owner; this is what lets an auditor see clock drift.
  device_monotonic_ms bigint,

  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  -- True when the action was queued with no signal and flushed later. The
  -- distinction matters: a sync is evidence of a gap in connectivity, not of
  -- an action that happened at the flush time.
  offline_queued boolean not null default false,

  payload jsonb not null default '{}'::jsonb,

  -- Chain: sha256 over (previous hash + this row's canonical content). Altering
  -- any past row breaks every hash after it, so tampering is detectable.
  prev_hash text not null default '',
  content_hash text not null,

  created_at timestamptz not null default now()
);

create index if not exists field_actions_claim_idx
  on public.field_actions (claim_id, id);

create index if not exists field_actions_inspection_idx
  on public.field_actions (inspection_id, id desc);

create index if not exists field_actions_inspector_idx
  on public.field_actions (inspector_id, id desc);

/**
 * The chain is what makes the trail admissible. An UPDATE or DELETE against a
 * past action would silently rewrite history, so both are refused — the same
 * pattern `audit_events` already uses.
 */
create or replace function public.field_actions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'field_actions is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists field_actions_no_update on public.field_actions;
create trigger field_actions_no_update
  before update or delete on public.field_actions
  for each row execute function public.field_actions_append_only();

-- ---------------------------------------------------------------------------
-- 3. Media — tie a photo to the verification phase and to where it was taken.
-- ---------------------------------------------------------------------------

alter table public.inspection_media
  add column if not exists claim_id uuid references public.inspector_claims(id) on delete set null;
alter table public.inspection_media
  add column if not exists phase text not null default 'evidence';
alter table public.inspection_media
  add column if not exists latitude double precision;
alter table public.inspection_media
  add column if not exists longitude double precision;
alter table public.inspection_media
  add column if not exists content_hash text;
alter table public.inspection_media
  add column if not exists captured_at timestamptz;

-- The original category list predates the legal multi-angle requirement. Widening
-- it is safe for existing rows (superset) and necessary for the four mandatory
-- shots the field workflow enforces.
alter table public.inspection_media
  drop constraint if exists inspection_media_category_check;
alter table public.inspection_media
  add constraint inspection_media_category_check
  check (category in (
    'صور خارجية', 'صور داخلية', 'المحرك', 'الشاص', 'الإطارات',
    'مستندات', 'لوحة العدادات', 'لوحة السيارة', 'المركبة كاملة',
    'لوحة المعرض', 'تقرير الفحص', 'إثبات الإلغاء'
  ));

create index if not exists inspection_media_claim_idx
  on public.inspection_media (claim_id)
  where claim_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Support tickets and handover requests.
-- ---------------------------------------------------------------------------

create table if not exists public.inspector_support_tickets (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.user_profiles(id) on delete restrict,
  inspection_id text references public.inspections(id) on delete set null,
  claim_id uuid references public.inspector_claims(id) on delete set null,
  category text not null
    check (category in (
      'technical', 'showroom_dispute', 'location_mismatch', 'payment',
      'safety', 'account', 'other'
    )),
  subject text not null check (char_length(subject) between 3 and 200),
  body text not null default '' check (char_length(body) <= 4000),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text not null default ''
);

create index if not exists inspector_support_tickets_inspector_idx
  on public.inspector_support_tickets (inspector_id, created_at desc);

create index if not exists inspector_support_tickets_status_idx
  on public.inspector_support_tickets (status, created_at desc);

create table if not exists public.inspector_handover_requests (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.inspector_claims(id) on delete cascade,
  inspection_id text not null references public.inspections(id) on delete cascade,
  city text not null,
  from_inspector_id uuid not null references public.user_profiles(id) on delete restrict,
  to_inspector_id uuid references public.user_profiles(id) on delete set null,
  reason text not null
    check (reason in ('emergency', 'vehicle_unavailable', 'showroom_denied', 'safety', 'other')),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  latitude double precision,
  longitude double precision
);

create unique index if not exists inspector_handover_one_pending_per_claim
  on public.inspector_handover_requests (claim_id)
  where status = 'pending';

create index if not exists inspector_handover_city_pending
  on public.inspector_handover_requests (city, status)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 5. Badges — professional recognition.
-- ---------------------------------------------------------------------------

create table if not exists public.inspector_badges (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.user_profiles(id) on delete cascade,
  badge_key text not null
    check (badge_key in (
      'reliable', 'fastest_responder', 'century_club',
      'zero_cancellations', 'documentation_ace', 'veteran'
    )),
  earned_at timestamptz not null default now(),
  -- The metric value that earned it, kept so the badge can explain itself.
  metric_value numeric(12, 2),
  unique (inspector_id, badge_key)
);

-- ---------------------------------------------------------------------------
-- 5b. Payout requests — the wallet's only write path.
-- ---------------------------------------------------------------------------

/**
 * A payout request is a *claim on money*, so it carries the same evidentiary
 * fields as a field action: when it was asked for, and where the inspector was
 * standing. The balance itself is never stored — it is derived from completed
 * inspections — so this table records intent, not value.
 *
 * `status` is a separate axis from the derived wallet balance: a request can be
 * pending, approved, or rejected, and the ledger reads that to decide whether an
 * entry is still "available" or already committed to a transfer.
 */
create table if not exists public.inspector_payout_requests (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.user_profiles(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 100000),
  currency text not null default 'SAR',
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'paid', 'rejected', 'cancelled')),
  -- An inspector-facing reference so a phone call about a transfer has a handle.
  reference text not null default '',
  latitude double precision,
  longitude double precision,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists inspector_payout_requests_by_inspector
  on public.inspector_payout_requests (inspector_id, requested_at desc);

-- At most one open request per inspector: a second tap while the first is
-- still being processed must not create a second claim on the same money.
create unique index if not exists inspector_payout_requests_one_open
  on public.inspector_payout_requests (inspector_id)
  where status in ('requested', 'approved');

-- ---------------------------------------------------------------------------
-- 6. RPC — atomic claim with distance-aware validation.
-- ---------------------------------------------------------------------------
/**
 * Claiming is the one place where two field inspectors can genuinely collide:
 * both see the same open order, both tap at the same moment. `for update` on
 * the inspection row serialises the two transactions, and the partial unique
 * index on `inspector_claims` is the second line of defence if anything ever
 * bypasses this function.
 *
 * Returns a small jsonb verdict rather than raising, so the UI can show a
 * specific Arabic message for "someone got there first" instead of a 500.
 */

-- ---------------------------------------------------------------------------
-- حراسة الوصول: deny-by-default مع سياسة تقييدية صريحة
-- ----------------------------------------------------------------------------
-- لا تُنشأ سياسة سماح واحدة. حتى لو أُضيف دور permissive مستقبلًا فلن يقرأ
-- هذه الجداول. service_role يتجاوز RLS بحكم التصميم.
-- ----------------------------------------------------------------------------

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'inspector_claims', 'field_actions', 'inspector_support_tickets',
    'inspector_handover_requests', 'inspector_badges', 'inspector_payout_requests'
  ]
  loop
    if to_regclass(format('public.%I', tbl)) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);
    execute format('revoke all on public.%I from public, anon, authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
    execute format('drop policy if exists %I_deny_all on public.%I', tbl, tbl);
    execute format(
      'create policy %I_deny_all on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      tbl, tbl
    );
  end loop;
end;
$$;


-- ==============================================================================
--  09/18 — 20261001000009_field_functions.sql
--  دوال الميدان
-- ==============================================================================

-- ============================================================================
-- 09 — عمليات الفاحص الميداني: دوال RPC
-- ----------------------------------------------------------------------------
-- claim_inspection_for_field / release_field_claim / record_field_action
-- كلها `create or replace` فهي idempotent. الأجسام منقولة حرفيًا.
-- ============================================================================

create or replace function public.claim_inspection_for_field(
  p_inspection_id text,
  p_inspector_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision,
  p_max_distance_m double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  profile public.user_profiles%rowtype;
  existing_claim public.inspector_claims%rowtype;
  distance_m double precision;
  new_claim_id uuid;
begin
  -- Serialise every claim attempt for this vehicle.
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into profile from public.user_profiles where id = p_inspector_id;
  if not found then
    return jsonb_build_object('status', 'unknown_inspector');
  end if;

  -- Coverage is enforced here, not only in the UI: an inspector who edits the
  -- request body must not be able to claim outside the five served cities.
  if not (inspection.city = any (profile.inspector_cities)) then
    return jsonb_build_object('status', 'out_of_zone', 'city', inspection.city);
  end if;

  if profile.inspector_status <> 'approved' then
    return jsonb_build_object('status', 'not_approved');
  end if;

  -- Already taken by someone else.
  if inspection.assigned_inspector_id is not null
     and inspection.assigned_inspector_id <> p_inspector_id then
    return jsonb_build_object('status', 'already_claimed');
  end if;

  if inspection.status not in ('open', 'assigned') then
    return jsonb_build_object('status', 'closed', 'current', inspection.status);
  end if;

  select * into existing_claim
    from public.inspector_claims
    where inspection_id = p_inspection_id
      and status in ('claimed', 'in_progress')
    for update;

  if found then
    if existing_claim.inspector_id = p_inspector_id then
      return jsonb_build_object(
        'status', 'already_yours',
        'claimId', existing_claim.id
      );
    end if;
    return jsonb_build_object('status', 'already_claimed');
  end if;

  -- Distance-aware validation only when both ends have coordinates. A missing
  -- fix is a degraded, not a failed, claim: the inspector still gets the job
  -- and the gap is recorded in the audit trail.
  if p_lat is not null and p_lng is not null
     and (inspection.vehicle ->> 'latitude') is not null
     and (inspection.vehicle ->> 'longitude') is not null then
    distance_m := 6371000 * acos(
      least(1, greatest(-1,
        cos(radians(p_lat)) * cos(radians((inspection.vehicle ->> 'latitude')::double precision))
        * cos(radians((inspection.vehicle ->> 'longitude')::double precision) - radians(p_lng))
        + sin(radians(p_lat)) * sin(radians((inspection.vehicle ->> 'latitude')::double precision))
      ))
    );
    if p_max_distance_m is not null and distance_m > p_max_distance_m then
      return jsonb_build_object(
        'status', 'too_far',
        'distanceM', round(distance_m)
      );
    end if;
  end if;

  insert into public.inspector_claims (
    inspection_id, inspector_id, city, status,
    claim_lat, claim_lng, claim_accuracy_m, claim_distance_m
  ) values (
    p_inspection_id, p_inspector_id, inspection.city, 'claimed',
    p_lat, p_lng, p_accuracy_m, distance_m
  )
  returning id into new_claim_id;

  update public.inspections
    set status = 'assigned',
        assigned_inspector_id = p_inspector_id
    where id = p_inspection_id;

  return jsonb_build_object(
    'status', 'ok',
    'claimId', new_claim_id,
    'distanceM', distance_m,
    'city', inspection.city
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC — release a claim (cancel or handover).
-- ---------------------------------------------------------------------------
/**
 * Cancelling returns the vehicle to the open pool so another inspector can take
 * it. Used by both the emergency-cancel flow and by an accepted handover.
 */
create or replace function public.release_field_claim(
  p_claim_id uuid,
  p_inspector_id uuid,
  p_reason text,
  p_note text,
  p_handed_over_to uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.inspector_claims%rowtype;
begin
  select * into claim
    from public.inspector_claims
    where id = p_claim_id
    for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if claim.inspector_id <> p_inspector_id then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if claim.status not in ('claimed', 'in_progress') then
    return jsonb_build_object('status', 'already_closed', 'current', claim.status);
  end if;

  update public.inspector_claims
    set status = case when p_handed_over_to is null then 'cancelled' else 'handed_over' end,
        cancelled_at = now(),
        cancel_reason = p_reason,
        cancel_note = coalesce(p_note, ''),
        handed_over_to = p_handed_over_to,
        updated_at = now()
    where id = p_claim_id;

  -- The order goes back to the pool. A handover keeps the same inspector
  -- assigned until the receiving inspector claims it, so the customer never
  -- sees the order bounce back to "open" during a swap.
  update public.inspections
    set status = 'open',
        assigned_inspector_id = null
    where id = claim.inspection_id
      and p_handed_over_to is null;

  return jsonb_build_object('status', 'ok', 'released', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPC — record a field action into the hash chain.
-- ---------------------------------------------------------------------------
/**
 * The chain has to be extended under a lock, otherwise two concurrent writes
 * could both read the same "previous" hash and fork the chain. `for update` on
 * the claim serialises the writes for that claim, and the row with the highest
 * id is the tip.
 */
create or replace function public.record_field_action(
  p_claim_id uuid,
  p_inspector_id uuid,
  p_action_type text,
  p_action_detail text,
  p_recorded_at text,
  p_device_monotonic_ms bigint,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision,
  p_offline_queued boolean,
  p_payload jsonb,
  p_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.inspector_claims%rowtype;
  previous_hash text := '';
  new_id bigint;
begin
  select * into claim
    from public.inspector_claims
    where id = p_claim_id
    for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if claim.inspector_id <> p_inspector_id then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select content_hash into previous_hash
    from public.field_actions
    where claim_id = p_claim_id
    order by id desc
    limit 1;

  previous_hash := coalesce(previous_hash, '');

  insert into public.field_actions (
    claim_id, inspection_id, inspector_id,
    action_type, action_detail,
    recorded_at_rfc3339, device_monotonic_ms,
    latitude, longitude, accuracy_m,
    offline_queued, payload, prev_hash, content_hash
  ) values (
    p_claim_id, claim.inspection_id, p_inspector_id,
    p_action_type, coalesce(p_action_detail, ''),
    p_recorded_at, p_device_monotonic_ms,
    p_lat, p_lng, p_accuracy_m,
    coalesce(p_offline_queued, false), coalesce(p_payload, '{}'::jsonb),
    previous_hash, p_content_hash
  )
  returning id into new_id;

  return jsonb_build_object('status', 'ok', 'actionId', new_id, 'prevHash', previous_hash);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants. Field tables are reached only through the service role; nothing
--    here is readable by `anon` or `authenticated`.
-- ---------------------------------------------------------------------------

alter table public.inspector_claims enable row level security;
alter table public.field_actions enable row level security;
alter table public.inspector_support_tickets enable row level security;
alter table public.inspector_handover_requests enable row level security;
alter table public.inspector_badges enable row level security;
alter table public.inspector_payout_requests enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'inspector_claims', 'field_actions', 'inspector_support_tickets',
    'inspector_handover_requests', 'inspector_badges', 'inspector_payout_requests'
  ]
  loop
    -- Deny-by-default: no policy is created, so even a future permissive role
    -- cannot read these. The service role bypasses RLS by design.
    execute format('drop policy if exists %I_deny_all on public.%I', tbl, tbl);
    execute format(
      'create policy %I_deny_all on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      tbl, tbl
    );
  end loop;
end;
$$;

revoke all on function public.claim_inspection_for_field(text, uuid, double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.release_field_claim(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.record_field_action(uuid, uuid, text, text, text, bigint, double precision, double precision, double precision, boolean, jsonb, text) from public, anon, authenticated;

grant execute on function public.claim_inspection_for_field(text, uuid, double precision, double precision, double precision, double precision) to service_role;
grant execute on function public.release_field_claim(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.record_field_action(uuid, uuid, text, text, text, bigint, double precision, double precision, double precision, boolean, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- حراسة التنفيذ
-- ----------------------------------------------------------------------------

do $$
declare
  sig text;
  fns text[] := array[
    'public.claim_inspection_for_field(text, uuid, double precision, double precision, double precision, double precision)',
    'public.release_field_claim(uuid, uuid, text, text, uuid)',
    'public.record_field_action(uuid, uuid, text, text, text, bigint, double precision, double precision, double precision, boolean, jsonb, text)'
  ];
begin
  foreach sig in array fns
  loop
    if to_regprocedure(sig) is null then
      continue;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', sig);
    execute format('grant execute on function %s to service_role', sig);
  end loop;
end;
$$;


-- ==============================================================================
--  10/18 — 20261001000010_rls_deny_by_default.sql
--  RLS: الرفض افتراضيًا
-- ==============================================================================

-- ============================================================================
-- 10 — تصريح الوصول النهائي (deny-by-default)
-- ----------------------------------------------------------------------------
-- هذا المشروع **لا يستخدم مفتاح anon مطلقًا**. كل قراءة وكتابة تمرّ عبر الخادم
-- (`lib/supabase/server.ts`) بمفتاح service_role، وservice_role يتجاوز RLS
-- كليًا. لا يوجد `NEXT_PUBLIC_SUPABASE_*` في المشروع إطلاقًا.
--
-- لذلك: تمكين RLS بلا أي سياسة يقفل الوصول المجهول تمامًا ويترك التطبيق يعمل
-- كما هو. دفاع في العمق بحت: لو أُضيف مفتاح anon يومًا أو تسرّب فلن يمنح شيئًا.
--
-- هذا الملف يُعاد تشغيله بأمان: يعالج الجداول الموجودة فقط ويتخطّى الغائب.
-- ============================================================================

do $$
declare
  target text;
begin
  foreach target in array array[
    'user_profiles', 'inspections', 'inspection_offers', 'otp_challenges',
    'rate_limits', 'inspection_reports', 'inspection_media', 'audit_events',
    'inspector_applications', 'inspector_devices',
    'inspector_claims', 'field_actions', 'inspector_support_tickets',
    'inspector_handover_requests', 'inspector_badges', 'inspector_payout_requests'
  ]
  loop
    if to_regclass(format('public.%I', target)) is null then
      raise notice 'skipping missing table: %', target;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public, anon, authenticated', target);
    execute format('grant all on public.%I to service_role', target);
  end loop;
end;
$$;

-- التحقق (نفّذه يدويًا): المتوقع صفر صفوف.
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated');


-- ==============================================================================
--  11/18 — 20261001000011_owner_inspector_view.sql
--  وضع عرض الفاحص للمالك
-- ==============================================================================

-- ============================================================================
-- 11 — لوحة الفاحصين لحساب المالك: ترقية الدور وتعيين المدن
-- ----------------------------------------------------------------------------
-- هذا الملف **آخر** الملفات زمنيًا، وأثره مقصود ومحدود: يرقّي صف المالك
-- (وحده) إلى فاحص معتمد بمدن كاملة، لكي **تعمل** لوحة الفاحصين المكتبية لا
-- أن تُفتح فارغة.
--
-- ── لماذا يلزم هذا أصلًا؟ ─────────────────────────────────────────────────
--
--   `getSession()` في `lib/auth.ts` تحسم الدور هكذا:
--
--       isAdmin ? (elevated ? 'admin' : 'admin_pending')
--               : inspectorStatus === 'approved' ? 'inspector' : 'customer'
--
--   أي أن المالك **لا يمكن أن يُحلّ إلى `inspector` أبدًا**، لأن فرع الأدمن
--   يفوز دائمًا. لذلك وُجد وضع «الدخول كمفتش» (كوكي `fahes_inspector_view`
--   الموقّع والمرتبط بالجلسة) الذي يجعل صفحات الفاحص وواجهاتها البرمجية تمرّ.
--
--   لكن لوحة التحكم المكتبية تقرأ أيضًا **بيانات الفاحص نفسه**: مدنه، وحالته،
--   وقائمة الطلبات المتاحة. بدون `inspector_status = 'approved'` ومدن محدَّدة
--   ستُفتح الصفحة لكنها ستبقى قشرة فارغة: لا طلبات، لا مدن، وشريط «غير متاح»
--   دائم.
--
-- ── ما لا يفعله هذا الملف ────────────────────────────────────────────────
--
--   * لا يمنح أي حساب آخر صلاحية فاحص.
--   * لا يمسّ صفوف الفاحصين الحقيقيين.
--   * لا يعطّل قفل الجهاز عنهم — الاستثناء محصور في `role = 'admin'`، وقفل
--     الجهاز في 07 يقرأ العلامة نفسها.
--
-- ⚠️ إن أردت تخطّي هذه الخطوة: احذف الملف. ستعمل اللوحة لكنها ستبدو فارغة.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. ضمان وجود الأعمدة (تصحيح وقائي لقاعدة بُنيت يدويًا)
-- ----------------------------------------------------------------------------

alter table public.user_profiles
  add column if not exists inspector_status text not null default 'none',
  add column if not exists inspector_cities text[] not null default '{}',
  add column if not exists is_online boolean not null default false,
  add column if not exists inspector_profile_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1. ترقية صف المالك
-- ----------------------------------------------------------------------------
-- ملاحظة: الجدول الحيّ لا يحتوي عمود `updated_at` (تحقّقنا فعليًا). الأعمدة
-- الزمنية المتاحة هي created_at, last_login_at, inspector_profile_updated_at.
-- ----------------------------------------------------------------------------

update public.user_profiles
   set inspector_status = 'approved',
       inspector_cities = coalesce(
         nullif(inspector_cities, '{}'::text[]),
         array['الدمام','الخبر','الجبيل','القطيف','الأحساء']::text[]
       ),
       inspector_profile_updated_at = now()
 where clerk_user_id in (
   select unnest(string_to_array(
     coalesce(
       current_setting('app.owner_clerk_ids', true),
       'user_3K3C1Rawe2bnwDKHtUeDanSXMdC'
     ), ','
   ))
 );

-- شبكة أمان: إن لم يُصَب أي صف (مثلًا اختلف معرّف Clerk)، حدِّث أي أدمن ناقص.
update public.user_profiles
   set inspector_status = 'approved',
       inspector_cities = coalesce(
         nullif(inspector_cities, '{}'::text[]),
         array['الدمام','الخبر','الجبيل','القطيف','الأحساء']::text[]
       ),
       inspector_profile_updated_at = now()
 where role = 'admin'
   and inspector_status <> 'approved';

-- ---------------------------------------------------------------------------
-- 2. عرض تشخيصي سريع (اختياري — نفّذه يدويًا للتحقق)
-- ----------------------------------------------------------------------------
--   select name, role, inspector_status, inspector_cities
--     from public.user_profiles where role = 'admin';
--   -- المتوقع: role=admin | inspector_status=approved | المدن الخمس
-- ----------------------------------------------------------------------------


-- ==============================================================================
--  12/18 — 20261001000012_region_coverage_and_offers.sql
--  تغطية المناطق والعروض
-- ==============================================================================

-- ============================================================================
-- 20261001000012 — تغطية المناطق · تقديم العروض · سرعة تبديل المنطقة
-- ----------------------------------------------------------------------------
-- يحلّ هذا الملف أربع مسائل متصلة، وسبب وجودها مشترك: كان «من يحقّ له العمل»
-- مُشتقًّا في أربعة أماكن مختلفة، فتناقضت. المكان الواحد الآن هو
-- `public.inspector_is_eligible` أدناه.
--
--   1. «الطلب لم يعد متاحًا» رغم أن الطلب مفتوح.
--      السبب: `submit_inspection_offer` كانت تشترط `role = 'inspector'`، وحساب
--      المالك دورُه `admin` (لا يمكن أن يكون `inspector`: `getSession()` يحسم
--      الدور بـ `isAdmin ? … : …` فيفوز فرع الأدمن دائمًا). النتيجة `forbidden`
--      — وهو نفس العطل الذي ظهر قبلها في 14 مسارًا وفي قفل الجهاز.
--
--   2. تغطية المناطق كانت تُفحص مرتين بمصدرين: `p_cities` تُمرَّر من Node،
--      و`user_profiles.inspector_cities` في القاعدة. أي اختلاف بينهما = سلوك
--      متعارض. الآن القاعدة هي المرجع ولا يُقبل النصّ المُمرَّر إلا كتلميح.
--
--   3. تبديل المناطق كان يستعلم عن كل الطلبات المفتوحة ثم يرشّح في الذاكرة.
--      الفهارس أدناه تجعل الترشيح داخل القاعدة.
--
--   4. السباق: فاحصان يقدّمان آخر عرضين في اللحظة نفسها. القفل على صف الطلب
--      (`for update`) موجود، لكن رسالة السباق كانت «الطلب لم يعد متاحًا» —
--      مبهمة. الآن `closed` مميّزة عن `not_found`.
--
-- كل شيء idempotent: يمكن تشغيل هذا الملف مرارًا بلا أثر جانبي.
-- ============================================================================


-- ------------------------------------------------------------------ صحة البيانات
-- المدن المدعومة تُكتب في القاعدة مرة واحدة. هذا ليس تجاوزًا لمصدر الحقيقة في
-- `lib/locations/saudi-cities.ts` — بل انعكاس له، لأن الدوال هنا تعمل في القاعدة
-- حيث لا يمكنها قراءة TypeScript. أي مدينة تُضاف هناك يجب أن تُضاف هنا.
create or replace function public.supported_cities()
returns text[]
language sql
immutable
as $$
  select array['الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء']::text[]
$$;

-- ملاحظة: الأسماء مأخوذة حرفيًا من `SUPPORTED_CITIES` في
-- `lib/locations/saudi-cities.ts` (الدمام · الخبر · الجبيل · القطيف · الأحساء).
-- تحقّق المطابقة النصّية في نهاية الملف قبل الاعتماد على هذه القائمة.
-- ⚠️ «القطيف» لا «القطف» — خطأ حرف واحد يجعل القائمة كلها لا تطابق أحدًا.


-- ═══════════════════════════════════════════════════════ 1. المصدر الواحد للأهلية
/**
 * هل هذا الحساب مؤهّل لتقديم عرض على هذا الطلب؟
 *
 * تجمع الدالة كل الشروط في مكان واحد، فتصبح كل نقطة استدعاء — SQL أو Node —
 * متّسقة بحكم البناء لا بحكم الانتباه.
 *
 * الشروط:
 *   (أ) الحساب معتمد كفاحص (`inspector_status = 'approved'`) — **بلا فحص
 *       `role`**. المالك دورُه `admin` و`inspector_status = 'approved'`، وهو
 *       مشمول بالقصد: هو صاحب المنصّة وليس حلقة في سجل الفاحصين، والقفل يحمي
 *       السجل لا المالك.
 *   (ب) الحساب متاح (`is_online`).
 *   (ج) مدينة الطلب ضمن مدن تغطيته **كما هي في القاعدة** — لا كما مرّرها المتصل.
 *
 * ⚠️ لا تُضِف شرطًا على `role` هنا. راجع السجل 2026-10-03 §«غير مصرح»:
 * الشرط نفسه أخرج 14 مسارًا و`submit_inspection_offer` عن العمل للمالك.
 */
create or replace function public.inspector_is_eligible(
  p_inspector_id uuid,
  p_city text,
  p_cities text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_profiles p
     where p.id = p_inspector_id
       and p.inspector_status = 'approved'
       and p.is_online
       and p_city = any (
         -- القاعدة هي المرجع؛ `p_cities` تلميح للتوافق فقط، ولا تمنح شيئًا.
         case
           when cardinality(coalesce(p.inspector_cities, '{}')) > 0 then p.inspector_cities
           else coalesce(p_cities, '{}')
         end
       )
  )
$$;


-- ═══════════════════════════════════════ 2. الطلبات المؤهَّلة (استعلام واحد سريع)
/**
 * الطلبات المفتوحة المتاحة لهذا الفاحص، مرشَّحة داخل القاعدة.
 *
 * كانت Node تجلب كل الطلبات المفتوحة (حتى 200) ثم ترشّح بالمدينة في الذاكرة —
 * عمل يزداد سوءًا مع النمو. هنا الترشيح يستخدم `inspections_city_status_idx`.
 */
create or replace function public.list_eligible_inspections(
  p_inspector_id uuid,
  p_limit integer default 200
)
returns setof public.inspections
language sql
stable
security definer
set search_path = ''
as $$
  select i.*
    from public.inspections i
    join public.user_profiles p on p.id = p_inspector_id
   where i.status = 'open'
     and p.inspector_status = 'approved'
     and i.city = any (coalesce(p.inspector_cities, '{}'))
     and i.customer_id <> p_inspector_id           -- لا يعرض الفاحص على طلبه
     and not exists (                              -- لم يقدّم عرضًا بعد
       select 1 from public.inspection_offers o
        where o.inspection_id = i.id and o.inspector_id = p_inspector_id
     )
   order by i.scheduled_at asc
   limit greatest(1, least(coalesce(p_limit, 200), 500))
$$;


-- ══════════════════════════════════════ 3. تقديم العرض — مُصحَّح ومقاوم للسباق
/**
 * يُنشئ عرضًا. الفحوص كلها داخل قفل على صف الطلب.
 *
 * `p_cities` تبقى في التوقيع للتوافق، لكنها **لم تعد تمنح حقًّا**: قد تُمرَّر
 * قائمة قديمة من عميل لم يُحدَّث، وكان ذلك يُنتج «الطلب غير متاح في مدن عملك»
 * لطلب هو في مدنه فعلًا. القاعدة تُقرأ مباشرة الآن.
 */
create or replace function public.submit_inspection_offer(
  p_inspection_id text,
  p_inspector_id uuid,
  p_inspector_name text,
  p_price numeric,
  p_note text,
  p_cities text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  offer_id uuid;
begin
  if p_price is null or p_price < 50 or p_price > 100000 then
    return jsonb_build_object('status', 'invalid_price');
  end if;

  -- القفل أولًا: كل فحص لاحق يرى حالة الطلب عند اللحظة المتسلسلة نفسها،
  -- فيستحيل أن يمرّ عرضان على طلب انتقل إلى `assigned`.
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- `closed` ليست `not_found`: الطلب موجود لكنه لم يعد يقبل عروضًا. الرسالة
  -- في الواجهة تفرّق بينهما بدل «لم يعد متاحًا» المبهمة.
  if inspection.status <> 'open' then
    return jsonb_build_object('status', 'closed', 'inspectionStatus', inspection.status);
  end if;

  if not public.inspector_is_eligible(p_inspector_id, inspection.city, p_cities) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  insert into public.inspection_offers (inspection_id, inspector_id, inspector_name, price, note)
  values (p_inspection_id, p_inspector_id, p_inspector_name, p_price, p_note)
  on conflict (inspection_id, inspector_id) do nothing
  returning id into offer_id;

  if offer_id is null then
    return jsonb_build_object('status', 'duplicate');
  end if;

  return jsonb_build_object('status', 'ok', 'offerId', offer_id);
end;
$$;


-- ══════════════════════════════ 4. قبول العرض — إغلاق ذرّي يمنع «لم يعد متاحًا»
/**
 * قبول عرض يُقفل الطلب في المعاملة نفسها: `assigned` + ربط الفاحص + رفض البقية.
 * كل ذلك داخل القفل، فلا يمكن أن ينجح قبولان على طلب واحد.
 */
create or replace function public.accept_inspection_offer(
  p_inspection_id text,
  p_offer_id uuid,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inspection public.inspections%rowtype;
  selected_offer public.inspection_offers%rowtype;
begin
  select * into inspection
    from public.inspections
    where id = p_inspection_id
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if inspection.customer_id <> p_customer_id then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if inspection.status <> 'open' then
    return jsonb_build_object('status', 'closed', 'inspectionStatus', inspection.status);
  end if;

  select * into selected_offer
    from public.inspection_offers
    where id = p_offer_id
      and inspection_id = p_inspection_id
      and status = 'pending'
    for update;

  if not found then
    return jsonb_build_object('status', 'offer_not_found');
  end if;

  update public.inspection_offers
     set status = case when id = p_offer_id then 'accepted' else 'declined' end
   where inspection_id = p_inspection_id;

  update public.inspections
     set status = 'assigned',
         assigned_inspector_id = selected_offer.inspector_id,
         accepted_offer_id = selected_offer.id
   where id = p_inspection_id;

  return jsonb_build_object(
    'status', 'ok',
    'inspectorId', selected_offer.inspector_id,
    'inspectorName', selected_offer.inspector_name,
    'price', selected_offer.price
  );
end;
$$;


-- ═══════════════════════════════════════════════════════ 5. الطلبات لجهة العميل
/**
 * طلبات العميل مع عدد العروض وأفضلها سعرًا — استعلام واحد بدل N+1.
 * تُستخدم في `/dashboard` وفي `/requests`.
 */
create or replace function public.list_customer_inspections(p_customer_id uuid)
returns table (
  id text,
  status text,
  city text,
  district text,
  scheduled_at timestamptz,
  offers_count integer,
  best_price numeric,
  assigned_inspector_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         i.status,
         i.city,
         i.district,
         i.scheduled_at,
         coalesce(o.cnt, 0)::integer            as offers_count,
         o.best_price,
         a.inspector_name                       as assigned_inspector_name
    from public.inspections i
    left join lateral (
      select count(*) as cnt, min(price) as best_price
        from public.inspection_offers
       where inspection_id = i.id and status <> 'declined'
    ) o on true
    left join public.inspection_offers a on a.id = i.accepted_offer_id
   where i.customer_id = p_customer_id
   order by i.created_at desc
$$;


-- ══════════════════════════════════════════════════════════════════ 6. الفهارس
-- الترشيح حسب المنطقة كان يمرّ على الجدول كاملًا. هذه الفهارس تجعله بحثًا
-- مباشرًا، وهو ما يظهر فورًا عند التبديل بين المدن.
create index if not exists inspections_city_status_idx
  on public.inspections (city, status);

create index if not exists inspections_customer_created_idx
  on public.inspections (customer_id, created_at desc);

create index if not exists inspections_assigned_status_idx
  on public.inspections (assigned_inspector_id, status)
  where assigned_inspector_id is not null;

create index if not exists inspection_offers_inspector_idx
  on public.inspection_offers (inspector_id, status);

-- تُستخدم في `not exists (…)` داخل `list_eligible_inspections`.
create index if not exists inspection_offers_inspection_inspector_idx
  on public.inspection_offers (inspection_id, inspector_id);

-- الترشيح بـ`city = any(array)` يستفيد من GIN بدل المسح التسلسلي.
create index if not exists user_profiles_inspector_cities_idx
  on public.user_profiles using gin (inspector_cities);

create index if not exists user_profiles_approved_online_idx
  on public.user_profiles (inspector_status, is_online)
  where inspector_status = 'approved';


-- ══════════════════════════════════════════════════════════ 7. الصلاحيات
-- نفس طريق بقية الدوال: لا وصول لـanon/authenticated مباشرة؛ service_role فقط
-- (أي من مسارات Next بعد التحقق من الجلسة).
do $$
declare
  sig text;
  fns text[] := array[
    'public.supported_cities()',
    'public.inspector_is_eligible(uuid, text, text[])',
    'public.list_eligible_inspections(uuid, integer)',
    'public.submit_inspection_offer(text, uuid, text, numeric, text, text[])',
    'public.accept_inspection_offer(text, uuid, uuid)',
    'public.list_customer_inspections(uuid)'
  ];
begin
  foreach sig in array fns
  loop
    if to_regprocedure(sig) is null then
      raise notice 'skipping missing function: %', sig;
      continue;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', sig);
    execute format('grant execute on function %s to service_role', sig);
  end loop;
end;
$$;


-- ══════════════════════════════════════════════════════════════ 8. التحقق الذاتي
do $$
declare
  n_open integer;
  n_offers integer;
begin
  select count(*) into n_open from public.inspections where status = 'open';
  select count(*) into n_offers from public.inspection_offers;

  raise notice 'cities: %', array_to_string(public.supported_cities(), '، ');
  raise notice 'open inspections: %, offers: %', n_open, n_offers;
end;
$$;


-- ==============================================================================
--  13/18 — 20261003180000_fahes_admin_40_modules.sql
--  وحدات لوحة الإدارة الأربعون
-- ==============================================================================

-- ============================================================================
-- 13 — وحدات لوحة الإدارة: الجداول الجديدة للوحة التحكم (40 وحدة)
-- ----------------------------------------------------------------------------
-- هذا الترحيل يضيف فقط الجداول **الغائبة** عن المخطط الحالي.
-- الجداول الموجودة (inspections, inspection_media, audit_events,
-- inspector_support_tickets, inspector_applications) لا تُعاد — يُضاف
-- إليها أعمدة فقط بـ`add column if not exists`.
--
-- idempotent بالكامل: آمن للتشغيل على قاعدة بها بعض هذه الجداول.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. المواقع الحية للفاحصين (الوحدات 1، 4، 18)
--    تتبّع لحظي للحالة، السرعة، الاتجاه، مستوى البطارية، وكشف الموقع المزيّف.
--    يُضاف لاحقًا عبر Realtime publication ليكون مشتركًا لحظيًا.
-- ---------------------------------------------------------------------------

create table if not exists public.inspector_locations (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.user_profiles(id) on delete cascade unique,
  latitude double precision not null,
  longitude double precision not null,
  heading double precision default 0,
  speed double precision default 0,
  status text not null default 'available'
    check (status in ('available', 'en_route', 'inspecting', 'offline')),
  battery_level int check (battery_level is null or battery_level between 0 and 100),
  is_mock_location boolean not null default false,
  accuracy_m double precision,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspector_locations_status_idx
  on public.inspector_locations (status);

create index if not exists inspector_locations_updated_idx
  on public.inspector_locations (updated_at desc);

-- ---------------------------------------------------------------------------
-- 2. مناطق التحديد الجغرافي (الوحدات 2، 13)
--    حدود المناطق الخمس المدعومة مع سعر القاعدة لكل منطقة.
--    أسماء المدن بالعربية مطابقة لـ SUPPORTED_CITIES.
-- ---------------------------------------------------------------------------

create table if not exists public.geofence_zones (
  id uuid primary key default gen_random_uuid(),
  city_name text not null check (city_name in ('الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء')),
  zone_name text not null,
  boundary_polygon jsonb not null,
  base_price numeric(10, 2) not null default 250.00 check (base_price >= 50 and base_price <= 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city_name, zone_name)
);

-- ---------------------------------------------------------------------------
-- 3. طابور مراجعة الجودة (الوحدة 8)
--    توجيه 10% من التقارير المكتملة لمراجعة بشرية قبل الإرسال.
--    يربط بـ inspections (لا orders) و user_profiles للمراجع.
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_audits (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(id) on delete cascade,
  auditor_id uuid references public.user_profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'passed', 'flagged_for_fix', 'rejected')),
  audit_notes text not null default '',
  flagged_categories text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists inspection_audits_status_idx
  on public.inspection_audits (status, created_at desc);

create index if not exists inspection_audits_inspection_idx
  on public.inspection_audits (inspection_id);

-- ---------------------------------------------------------------------------
-- 4. سجل المخالفات (الوحدة 9)
--    تسجيل آلي: مواقع مزيفة، تأخّر، إلغاء بلا عذر، تجاوز حدود المنطقة.
-- ---------------------------------------------------------------------------

create table if not exists public.inspector_violations (
  id uuid primary key default gen_random_uuid(),
  inspector_id uuid not null references public.user_profiles(id) on delete cascade,
  inspection_id text references public.inspections(id) on delete set null,
  violation_type text not null
    check (violation_type in ('fake_gps', 'tardiness', 'unexcused_cancel', 'zone_breach', 'speed_anomaly', 'photo_tamper')),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  details jsonb not null default '{}'::jsonb,
  auto_detected boolean not null default true,
  resolved boolean not null default false,
  resolution_note text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists inspector_violations_inspector_idx
  on public.inspector_violations (inspector_id, created_at desc);

create index if not exists inspector_violations_unresolved_idx
  on public.inspector_violations (severity, created_at desc)
  where resolved = false;

-- ---------------------------------------------------------------------------
-- 5. النزاعات والاسترداد (الوحدة 15)
--    إدارة النزاعات القائمة على الأدلة والاسترداد الجزئي.
-- ---------------------------------------------------------------------------

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(id) on delete cascade,
  client_id uuid not null references public.user_profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'open'
    check (status in ('open', 'under_review', 'approved', 'rejected', 'resolved')),
  refund_amount numeric(10, 2) not null default 0.00 check (refund_amount >= 0),
  evidence_urls text[] not null default '{}'::text[],
  resolution_note text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_profiles(id) on delete set null
);

create index if not exists disputes_status_idx
  on public.disputes (status, created_at desc);

create index if not exists disputes_client_idx
  on public.disputes (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. إعدادات النظام ومفتاح الطوارئ (الوحدة 37)
--    قيم JSONB مرنة لمفاتيح النظام. الإعداد الافتراضي = تعطيل اختياري للمدن.
-- ---------------------------------------------------------------------------

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.user_profiles(id) on delete set null
);

insert into public.system_settings (key, value, description)
values
  ('kill_switch', '{"global_disabled": false, "disabled_cities": []}'::jsonb, 'مفتاح الطوارئ: تعطيل عالمي أو حسب المدينة'),
  ('audit_sample_rate', '{"rate": 0.10}'::jsonb, 'نسبة التقارير المُحالة لمراجعة الجودة'),
  ('pricing_defaults', '{"base": 250, "surge_multiplier": 1.0, "peak_hours": []}'::jsonb, 'إعدادات التسعير الافتراضية'),
  ('dispatch_settings', '{"auto_dispatch": true, "max_distance_km": 30, "min_rating": 3.5}'::jsonb, 'إعدادات التوجيه التلقائي')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 7. قوالب الفحص (الوحدة 28)
--    محرّر نماذج بلا كود لقوائم فحص المركبات.
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 100),
  version int not null default 1,
  schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_templates_active_idx
  on public.inspection_templates (is_active, updated_at desc)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 8. ملاحظات الإدارة الداخلية (الوحدة 30)
--    سجل زمني لملاحظات الإدارة على الطلبات.
-- ---------------------------------------------------------------------------

create table if not exists public.order_internal_notes (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(id) on delete cascade,
  author_id uuid not null references public.user_profiles(id) on delete restrict,
  note text not null check (char_length(note) between 1 and 4000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists order_internal_notes_inspection_idx
  on public.order_internal_notes (inspection_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. الإعلانات الموجهة (الوحدة 27)
--    تنبيهات مبنية على المنطقة (طقس، صيانة، تحديثات).
-- ---------------------------------------------------------------------------

create table if not exists public.broadcast_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 200),
  body text not null check (char_length(body) between 1 and 2000),
  target_cities text[] not null default '{}'::text[], -- فارغ = كل المدن
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'emergency')),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists broadcast_announcements_active_idx
  on public.broadcast_announcements (is_active, created_at desc)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 10. تحليلات صور الذكاء الاصطناعي (الوحدة 31)
--     نتائج فحص الوضوح والزاوية والتشويش قبل تسليم التقرير.
-- ---------------------------------------------------------------------------

create table if not exists public.ai_photo_analyses (
  id uuid primary key default gen_random_uuid(),
  media_id uuid references public.inspection_media(id) on delete set null,
  inspection_id text references public.inspections(id) on delete cascade,
  clarity_score numeric(3, 2),
  blur_detected boolean not null default false,
  angle_ok boolean not null default true,
  issues text[] not null default '{}'::text[],
  ocr_plate_text text,
  ocr_vin_text text,
  model_version text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists ai_photo_analyses_inspection_idx
  on public.ai_photo_analyses (inspection_id);

create index if not exists ai_photo_analyses_media_idx
  on public.ai_photo_analyses (media_id)
  where media_id is not null;

-- ---------------------------------------------------------------------------
-- 11. أرشيف الطلبات البارد (الوحدة 39)
--     تخزين بارد للطلبات القديمة للحفاظ على سرعة الاستعلام.
-- ---------------------------------------------------------------------------

create table if not exists public.archived_inspections (
  id text primary key,
  original_data jsonb not null,
  archived_at timestamptz not null default now()
);

create index if not exists archived_inspections_archived_at_idx
  on public.archived_inspections (archived_at desc);

-- ---------------------------------------------------------------------------
-- 12. إحصائيات الفاحصين المجمّعة (الوحدة 7)
--     جدول ملخّص يُحدّث دوريًا لتجنّب استعلامات تجميعية ثقيلة.
-- ---------------------------------------------------------------------------

create table if not exists public.inspector_stats (
  inspector_id uuid primary key references public.user_profiles(id) on delete cascade,
  total_inspections int not null default 0,
  completed_count int not null default 0,
  cancelled_count int not null default 0,
  avg_duration_minutes numeric(8, 2),
  avg_rating numeric(3, 2),
  accuracy_score numeric(5, 2) not null default 100.00,
  violation_count int not null default 0,
  total_earnings numeric(12, 2) not null default 0.00,
  last_inspection_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 13. قواعد التسعير الديناميكي (الوحدة 13)
--     تسعير متزايد حسب المدينة، ساعات الذروة، فئة المركبة.
-- ---------------------------------------------------------------------------

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  city text check (city is null or city in ('الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء')),
  vehicle_tier text check (vehicle_tier is null or vehicle_tier in ('economy', 'mid', 'luxury', 'commercial')),
  peak_hour_start time,
  peak_hour_end time,
  surge_multiplier numeric(3, 2) not null default 1.00 check (surge_multiplier >= 0.50 and surge_multiplier <= 5.00),
  flat_adjustment numeric(10, 2) not null default 0.00,
  is_active boolean not null default true,
  priority int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pricing_rules_active_idx
  on public.pricing_rules (is_active, priority desc, city)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 14. شبكة المعارض (الوحدة 5)
--     متابعة المعارض الشريكة ومقاييس دورة الفحص.
-- ---------------------------------------------------------------------------

create table if not exists public.showrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  city text not null check (city in ('الدمام', 'الخبر', 'الجبيل', 'القطيف', 'الأحساء')),
  district text not null default '',
  address text not null default '',
  phone text,
  contact_person text,
  total_inspections int not null default 0,
  avg_turnaround_hours numeric(8, 2),
  is_partner boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists showrooms_city_idx
  on public.showrooms (city, is_active)
  where is_active = true;

-- ===========================================================================
-- أعمدة إضافية على جداول موجودة
-- ===========================================================================

-- inspections: إضافة أعمدة من موفّر الـ40 وحدة
alter table public.inspections
  add column if not exists is_critical_defect boolean not null default false;

alter table public.inspections
  add column if not exists qr_code_signature text unique;

alter table public.inspections
  add column if not exists showroom_id uuid references public.showrooms(id) on delete set null;

alter table public.inspections
  add column if not exists audit_status text
    check (audit_status is null or audit_status in ('not_required', 'pending', 'passed', 'flagged', 'rejected'))
    default 'not_required';

alter table public.inspections
  add column if not exists archived boolean not null default false;

-- inspection_media: إضافة أعمدة AI
alter table public.inspection_media
  add column if not exists ai_clarity_score numeric(3, 2);

alter table public.inspection_media
  add column if not exists ocr_plate_text text;

-- ===========================================================================
-- حراسة الوصول: deny-by-default (نفس عرف المشروع)
-- ===========================================================================

do $$
declare
  tbl text;
  tables text[] := array[
    'inspector_locations', 'geofence_zones', 'inspection_audits',
    'inspector_violations', 'disputes', 'system_settings',
    'inspection_templates', 'order_internal_notes',
    'broadcast_announcements', 'ai_photo_analyses',
    'archived_inspections', 'inspector_stats',
    'pricing_rules', 'showrooms'
  ];
begin
  foreach tbl in array tables loop
    if to_regclass(format('public.%I', tbl)) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);
    execute format('revoke all on public.%I from public, anon, authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
    execute format('drop policy if exists %I_deny_all on public.%I', tbl, tbl);
    execute format(
      'create policy %I_deny_all on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      tbl, tbl
    );
  end loop;
end;
$$;

-- ===========================================================================
-- Realtime publication: inspector_locations و inspections
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'inspector_locations'
  ) then
    alter publication supabase_realtime add table public.inspector_locations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'broadcast_announcements'
  ) then
    alter publication supabase_realtime add table public.broadcast_announcements;
  end if;
end;
$$;

-- ===========================================================================
-- دالة: تحديث موقع الفاحص (upsert مع كشف الموقع المزيّف)
-- ===========================================================================

create or replace function public.upsert_inspector_location(
  p_inspector_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_heading double precision default 0,
  p_speed double precision default 0,
  p_status text default 'available',
  p_battery_level int default null,
  p_is_mock_location boolean default false,
  p_accuracy_m double precision default null
)
returns public.inspector_locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc public.inspector_locations%rowtype;
begin
  insert into public.inspector_locations (
    inspector_id, latitude, longitude, heading, speed,
    status, battery_level, is_mock_location, accuracy_m,
    recorded_at, updated_at
  ) values (
    p_inspector_id, p_latitude, p_longitude, p_heading, p_speed,
    p_status, p_battery_level, p_is_mock_location, p_accuracy_m,
    now(), now()
  )
  on conflict (inspector_id) do update
    set latitude = excluded.latitude,
        longitude = excluded.longitude,
        heading = excluded.heading,
        speed = excluded.speed,
        status = excluded.status,
        battery_level = excluded.battery_level,
        is_mock_location = excluded.is_mock_location,
        accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at,
        updated_at = now()
  returning * into loc;

  -- كشف آلي للموقع المزيّف ⇒ مخالفة
  if p_is_mock_location then
    insert into public.inspector_violations (inspector_id, violation_type, severity, details, auto_detected)
    values (p_inspector_id, 'fake_gps', 'high',
      jsonb_build_object('latitude', p_latitude, 'longitude', p_longitude, 'accuracy', p_accuracy_m),
      true)
    on conflict do nothing;
  end if;

  return loc;
end;
$$;

do $$
begin
  if to_regprocedure('public.upsert_inspector_location(uuid, double precision, double precision, double precision, double precision, text, int, boolean, double precision)') is not null then
    revoke all on function public.upsert_inspector_location(uuid, double precision, double precision, double precision, double precision, text, int, boolean, double precision)
      from public, anon, authenticated;
    grant execute on function public.upsert_inspector_location(uuid, double precision, double precision, double precision, double precision, text, int, boolean, double precision)
      to service_role;
  end if;
end;
$$;

-- ===========================================================================
-- دالة: إنشاء طلب مراجعة جودة لتقرير مكتمل
-- ===========================================================================

create or replace function public.queue_inspection_audit(
  p_inspection_id text,
  p_auditor_id uuid default null
)
returns public.inspection_audits
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_row public.inspection_audits%rowtype;
  sample_rate jsonb;
begin
  -- التحقق من أن الطلب مكتمل
  if not exists (
    select 1 from public.inspections
    where id = p_inspection_id and status = 'completed'
  ) then
    raise exception 'inspection_not_completed';
  end if;

  -- التحقق من عدم وجود مراجعة سابقة
  if exists (
    select 1 from public.inspection_audits
    where inspection_id = p_inspection_id and status = 'pending'
  ) then
    raise exception 'audit_already_queued';
  end if;

  insert into public.inspection_audits (inspection_id, auditor_id, status)
  values (p_inspection_id, p_auditor_id, 'pending')
  returning * into audit_row;

  return audit_row;
end;
$$;

do $$
begin
  if to_regprocedure('public.queue_inspection_audit(text, uuid)') is not null then
    revoke all on function public.queue_inspection_audit(text, uuid)
      from public, anon, authenticated;
    grant execute on function public.queue_inspection_audit(text, uuid)
      to service_role;
  end if;
end;
$$;


-- ==============================================================================
--  14/18 — 20261004000000_national_id_verification.sql
--  التحقق من رقم الهوية الوطنية
-- ==============================================================================

-- ============================================================================
-- 14 — توثيق الهوية: رقم الهوية الوطنية + علامة التوثيق
-- ----------------------------------------------------------------------------
-- يضيف عمودين لجدول user_profiles: national_id (10 أرقام سعودية) و
-- national_id_verified_at (وقت الإدخال). العميل لا يُعتبر موثّقًا إلا لما
-- يوثّق جواله (عبر Clerk) ويُدخل رقم هويته.
--
-- idempotent: آمن للتشغيل على قاعدة موجودة.
-- ============================================================================

alter table public.user_profiles
  add column if not exists national_id text,
  add column if not exists national_id_verified_at timestamptz;

-- رقم الهوية السعودية: 10 أرقام تبدأ بـ 1 (سعودي) أو 2 (مقيم)
alter table public.user_profiles
  drop constraint if exists user_profiles_national_id_format;

alter table public.user_profiles
  add constraint user_profiles_national_id_format
  check (national_id is null or national_id ~ '^[12][0-9]{9}$');

-- فهرس فريد جزئي: رقم الهوية فريد لمن أدخله فقط
create unique index if not exists user_profiles_national_id_idx
  on public.user_profiles(national_id)
  where national_id is not null;


-- ==============================================================================
--  15/18 — 20261005000000_support_suite_and_phone_gate.sql
--  حزمة الدعم الفني + بوابة الجوال
-- ==============================================================================

-- ============================================================================
-- 05 — بوابة توثيق الجوال + مجموعة تذاكر الدعم الفني
-- ----------------------------------------------------------------------------
-- Fundamentals this migration establishes:
--
--   1. `user_profiles.phone_verified` — the single flag the route gatekeeper
--      (see `proxy.ts`) keys off. Backfilled for every account that already has
--      a Clerk-verified phone, so existing users are not locked out by the
--      change that introduces the gate.
--
--   2. `notifications` — the feed behind the inspector dashboard bell.
--
--   3. The support ticketing suite: tickets, threaded messages, an append-only
--      event log, and admin canned responses.
--
-- ── On RLS ──────────────────────────────────────────────────────────────────
-- This schema follows the project's existing convention (`core_schema.sql`):
-- RLS is *forced* and anon/authenticated are revoked outright, so no browser
-- ever queries these tables. Every read and write goes through the service role
-- in a server component or route handler, where ownership is checked against
-- the session. We deliberately do not add permissive `create policy` rules for
-- anon/authenticated: doing so would widen access compared with today, not
-- narrow it. The `create policy` statements below are therefore omitted by
-- design, not by oversight — see the README in this directory.
--
-- Idempotent throughout (`if not exists` / `or replace`), so it can be re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. توثيق الجوال — عمود واحد يحكم البوابة
-- ---------------------------------------------------------------------------

alter table public.user_profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz;

-- Backfill: an account that already carries a phone has one that Clerk verified
-- during sign-up (`verifiedPhoneNumber()` in `lib/auth.ts` only ever returns a
-- verified number). Without this, enabling the gate would sign every existing
-- user out to a wall they cannot pass.
update public.user_profiles
  set phone_verified = true,
      phone_verified_at = coalesce(phone_verified_at, now())
  where phone is not null
    and phone_verified = false;

create index if not exists user_profiles_phone_verified_idx
  on public.user_profiles (phone_verified)
  where phone_verified = false;

-- ---------------------------------------------------------------------------
-- 2. الإشعارات — مصدر جرس لوحة الفاحص
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null
    check (kind in ('request', 'schedule', 'report', 'payment', 'system', 'support')),
  severity text not null default 'info'
    check (severity in ('info', 'success', 'warning', 'critical')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The bell reads "newest unread for this user" on every dashboard load, so the
-- partial index keeps that query off the full table as the feed grows.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. تذاكر الدعم — الجداول الأربعة
-- ---------------------------------------------------------------------------

-- Human-readable ticket reference (`FAH-000123`). A sequence rather than
-- `count(*)` so two concurrent inserts can never collide on the same number.
create sequence if not exists public.support_ticket_number_seq;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique
    default 'FAH-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0'),
  requester_id uuid not null references public.user_profiles(id) on delete cascade,
  requester_role text not null default 'customer'
    check (requester_role in ('customer', 'inspector', 'admin')),
  subject text not null check (char_length(subject) between 3 and 200),
  category text not null
    check (category in (
      'inspection_issue', 'payment', 'app_bug', 'account_lock', 'other'
    )),
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),
  status text not null default 'open'
    check (status in (
      'open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'
    )),
  body text not null check (char_length(body) between 1 and 4000),
  inspection_id text references public.inspections(id) on delete set null,
  assigned_to uuid references public.user_profiles(id) on delete set null,
  -- Captured client-side at submit time. Debugging a field bug without the
  -- device that produced it is guesswork, and the inspector will have closed
  -- the app long before anyone reads the ticket.
  device_info jsonb not null default '{}'::jsonb,
  -- Optional last-known position; only ever set for field inspectors (feature 30).
  latitude double precision,
  longitude double precision,
  escalated_to text check (escalated_to in ('admin', 'operations')),
  escalated_at timestamptz,
  first_response_at timestamptz,
  -- Set on insert from the priority table below; drives the SLA breach warning.
  sla_due_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  -- While `now() < reopen_deadline` a user reply re-opens the ticket (feature 38).
  reopen_deadline timestamptz,
  satisfaction_rating smallint check (satisfaction_rating between 1 and 5),
  satisfaction_note text not null default '' check (char_length(satisfaction_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_open_idx
  on public.support_tickets (priority, created_at)
  where status in ('open', 'in_progress', 'waiting_for_user');

create index if not exists support_tickets_requester_idx
  on public.support_tickets (requester_id, created_at desc);

create index if not exists support_tickets_assignee_idx
  on public.support_tickets (assigned_to, status)
  where assigned_to is not null;

-- Drives the red "unanswered for > 15 minutes" highlight (feature 21).
create index if not exists support_tickets_sla_idx
  on public.support_tickets (sla_due_at)
  where first_response_at is null and status in ('open', 'in_progress');

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.user_profiles(id) on delete cascade,
  author_role text not null check (author_role in ('customer', 'inspector', 'admin')),
  body text not null default '' check (char_length(body) <= 8000),
  -- Admin-only thread (feature 19). Never serialised toward a non-admin caller.
  is_internal boolean not null default false,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint check (attachment_size is null or attachment_size > 0),
  -- Field voice notes (feature 29).
  audio_path text,
  audio_duration_seconds integer
    check (audio_duration_seconds is null or audio_duration_seconds between 1 and 600),
  -- Soft delete so message deletions stay auditable (feature 28).
  deleted_at timestamptz,
  deleted_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint support_ticket_messages_not_empty
    check (body <> '' or attachment_path is not null or audio_path is not null)
);

create index if not exists support_ticket_messages_thread_idx
  on public.support_ticket_messages (ticket_id, created_at);

-- Append-only trail of everything that happened to a ticket. Feature 28 wants
-- re-assignments and deletions in `audit_events` as well; those are written
-- there too (see `lib/support/store.ts`), while this table keeps the
-- ticket-scoped history the detail page renders as a status timeline.
create table if not exists public.support_ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid references public.user_profiles(id) on delete set null,
  event_type text not null
    check (event_type in (
      'created', 'status_changed', 'assigned', 'reassigned', 'escalated',
      'reopened', 'sla_breached', 'message_deleted', 'rated'
    )),
  from_value text,
  to_value text,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_events_ticket_idx
  on public.support_ticket_events (ticket_id, created_at);

-- Pre-written agent replies (feature 20). Seeded below with the three the spec
-- calls out explicitly; more can be added from the console without a migration.
create table if not exists public.support_canned_responses (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(label) between 2 and 120),
  body text not null check (char_length(body) between 2 and 4000),
  category text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. إغلاق الوصول المباشر — نفس نهج core_schema.sql
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'notifications', 'support_tickets', 'support_ticket_messages',
    'support_ticket_events', 'support_canned_responses'
  ]
  loop
    if to_regclass(format('public.%I', target)) is null then
      raise notice 'skipping missing table: %', target;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public, anon, authenticated', target);
    execute format('grant all on public.%I to service_role', target);
  end loop;

  -- The ticket-number sequence is read at INSERT time, so the service role needs
  -- USAGE on it explicitly; `grant all on table` does not cover sequences.
  if to_regclass('public.support_ticket_number_seq') is not null then
    revoke all on sequence public.support_ticket_number_seq from public, anon, authenticated;
    grant usage, select on sequence public.support_ticket_number_seq to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. الدوال — كل ما يجب أن يكون ذرّيًا
-- ---------------------------------------------------------------------------

-- Sets the gate flag. Kept as an RPC (rather than an `update` from the route)
-- so the audit row is written in the same transaction as the flag: a verified
-- phone with no trail, or a trail with no flag, are both unacceptable.
create or replace function public.mark_phone_verified(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.user_profiles
    set phone_verified = true,
        phone_verified_at = now()
    where id = p_user_id
      and phone is not null;

  get diagnostics affected = row_count;
  if affected = 0 then
    return false;
  end if;

  insert into public.audit_events (actor_id, event_type, resource_type, resource_id)
  values (p_user_id, 'user.phone_verified', 'user', p_user_id::text);

  return true;
end;
$$;

-- Atomic grab of an unassigned ticket. The `for update` is what makes two
-- agents clicking "claim" at the same moment safe: the second one sees the
-- first's assignment and gets `already_assigned` instead of silently stealing.
create or replace function public.claim_support_ticket(p_ticket_id uuid, p_admin_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assignee uuid;
  ticket_status text;
begin
  select assigned_to, status
    into current_assignee, ticket_status
    from public.support_tickets
    where id = p_ticket_id
    for update;

  if not found then
    return 'not_found';
  end if;

  if ticket_status in ('resolved', 'closed') then
    return 'closed';
  end if;

  if current_assignee is not null and current_assignee <> p_admin_id then
    return 'already_assigned';
  end if;

  update public.support_tickets
    set assigned_to = p_admin_id, updated_at = now()
    where id = p_ticket_id;

  insert into public.support_ticket_events (ticket_id, actor_id, event_type, to_value)
  values (
    p_ticket_id,
    p_admin_id,
    case when current_assignee is null then 'assigned' else 'reassigned' end,
    p_admin_id::text
  );

  return 'ok';
end;
$$;

-- Re-opens a ticket the user replies to inside the 48-hour window (feature 38).
-- Returns a verdict string so the caller can distinguish "too late" from
-- "someone else's ticket" without parsing an error.
create or replace function public.reopen_support_ticket(p_ticket_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
begin
  select requester_id, status, reopen_deadline
    into target
    from public.support_tickets
    where id = p_ticket_id
    for update;

  if not found then
    return 'not_found';
  end if;

  if target.requester_id <> p_user_id then
    return 'forbidden';
  end if;

  if target.status not in ('resolved', 'closed') then
    return 'not_closed';
  end if;

  if target.reopen_deadline is null or now() > target.reopen_deadline then
    return 'window_expired';
  end if;

  update public.support_tickets
    set status = 'open',
        resolved_at = null,
        closed_at = null,
        updated_at = now()
    where id = p_ticket_id;

  insert into public.support_ticket_events (ticket_id, actor_id, event_type, from_value, to_value)
  values (p_ticket_id, p_user_id, 'reopened', target.status, 'open');

  return 'ok';
end;
$$;

-- Functions are only ever called by the service role from a server route, so
-- EXECUTE is granted there and revoked from the browser-facing roles — the same
-- shape used for every other RPC in this schema.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.mark_phone_verified(uuid)',
    'public.claim_support_ticket(uuid, uuid)',
    'public.reopen_support_ticket(uuid, uuid)'
  ]
  loop
    if to_regprocedure(signature) is null then
      continue;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. الردود الجاهزة + بيانات أولية
-- ---------------------------------------------------------------------------

insert into public.support_canned_responses (label, body, category) values
  (
    'سياسة الاسترداد',
    'شكرًا لتواصلك. المبالغ المستردة تُعاد إلى وسيلة الدفع نفسها خلال 5 إلى 7 أيام عمل بعد اعتماد الطلب. لا نحتفظ ببيانات البطاقة على منصتنا، وستصلك رسالة تأكيد فور تنفيذ الاسترداد.',
    'payment'
  ),
  (
    'إصلاح الموقع (GPS)',
    'يبدو أن إحداثياتك غير دقيقة. من فضلك افتح إعدادات الجهاز، ثم التطبيقات، ثم تطبيق فاحص، واختر الصلاحيات وفعّل «الموقع أثناء الاستخدام»، ثم أعد فتح لوحة الميدان. إن استمرت المشكلة أرسل لقطة شاشة وسنراجعها فورًا.',
    'app_bug'
  ),
  (
    'الأسئلة الشائعة — التحقق',
    'لإكمال التحقق نحتاج: رقم جوال سعودي موثّق، ورقم هوية وطنية من 10 أرقام، وبريدًا إلكترونيًا مؤكدًا. إن كان أحدها ناقصًا فستظهر لك خطوة التحقق عند تسجيل الدخول. بعد إكمالها يُفعَّل حسابك تلقائيًا دون الحاجة إلى إعادة التسجيل.',
    'account_lock'
  )
on conflict (label) do nothing;

-- Private bucket for screenshots, PDFs and field voice notes. Private because a
-- support attachment routinely contains a customer's personal data; access is
-- via short-lived signed URLs minted server-side, exactly like `inspection-media`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/pdf',
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4'
  ]
)
on conflict (id) do nothing;


-- ==============================================================================
--  16/18 — 20261006000000_phone_otp_gate.sql
--  بوابة رمز التحقق (OTP) للجوال
-- ==============================================================================

-- ============================================================================
-- 06 — بوابة توثيق الجوال: طبقة الإنفاذ فوق OTP الموجود
-- ----------------------------------------------------------------------------
-- `otp_challenges` and its two RPCs (`store_otp_challenge`,
-- `verify_otp_challenge`) already exist from the core schema. They are keyed by
-- *phone* and already handle expiry, attempt counting and lockout.
--
-- This migration does NOT introduce a second, parallel OTP table. It adds only
-- what the phone gate needs on top:
--
--   1. `user_profiles.phone_verified` / `phone_verified_at` — the single flag the
--      route gatekeeper keys off. Added idempotently so this migration is valid
--      whether or not migration 05 has been applied.
--
--   2. `mark_phone_verified(uuid)` — flips the flag and writes the audit row in
--      one transaction. Redefined here so this file is self-sufficient.
--
--   3. `issue_phone_otp(phone, code_hash, expiry_minutes, cooldown_seconds)` —
--      a resend-cooldown-aware wrapper over `otp_challenges`. The core
--      `store_otp_challenge` deliberately has no cooldown; the spec requires a
--      60-second one, and enforcing it needs a read-then-write under the same row
--      lock, which is exactly what this function does.
--
-- Verification continues to go through the core `verify_otp_challenge`; the API
-- route calls it and, on `valid`, calls `mark_phone_verified`. Keeping the two
-- separate is deliberate: `verify_otp_challenge` is phone-keyed and knows nothing
-- about accounts, while `mark_phone_verified` is account-keyed.
--
-- Idempotent throughout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. عمود البوابة
-- ---------------------------------------------------------------------------

alter table public.user_profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz;

-- Backfill so enabling the gate does not lock out accounts that already hold a
-- Clerk-verified phone. `lib/auth.ts` only ever stores a verified number.
update public.user_profiles
  set phone_verified = true,
      phone_verified_at = coalesce(phone_verified_at, now())
  where phone is not null
    and phone_verified = false;

create index if not exists user_profiles_phone_verified_idx
  on public.user_profiles (phone_verified)
  where phone_verified = false;

-- ---------------------------------------------------------------------------
-- 2. قلب العلم + سجل التدقيق — في معاملة واحدة
-- ---------------------------------------------------------------------------

create or replace function public.mark_phone_verified(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.user_profiles
    set phone_verified = true,
        phone_verified_at = coalesce(phone_verified_at, now())
    where id = p_user_id
      and phone is not null;

  get diagnostics affected = row_count;
  if affected = 0 then
    return false;
  end if;

  insert into public.audit_events (actor_id, event_type, resource_type, resource_id)
  values (p_user_id, 'user.phone_verified', 'user', p_user_id::text);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. إصدار رمز جديد مع فرض المهلة الزمنية لإعادة الإرسال
-- ---------------------------------------------------------------------------

create or replace function public.issue_phone_otp(
  p_phone text,
  p_code_hash text,
  p_expiry_minutes integer,
  p_cooldown_seconds integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.otp_challenges%rowtype;
  now_at timestamptz := now();
begin
  select * into existing
    from public.otp_challenges
    where phone = p_phone
    for update;

  if found then
    if existing.locked_until is not null and existing.locked_until > now_at then
      return 'locked';
    end if;
    if existing.last_sent_at is not null
       and now_at < existing.last_sent_at + make_interval(secs => p_cooldown_seconds) then
      return 'cooldown';
    end if;
  end if;

  -- Opportunistic prune, matching the policy in `store_otp_challenge`.
  delete from public.otp_challenges
    where expires_at < now_at - interval '1 day'
      and (locked_until is null or locked_until <= now_at);

  insert into public.otp_challenges
    (phone, code_hash, attempts, created_at, expires_at, last_sent_at, locked_until)
  values
    (p_phone, p_code_hash, 0, now_at, now_at + make_interval(mins => p_expiry_minutes), now_at, null)
  on conflict (phone) do update
    set code_hash = excluded.code_hash,
        attempts = 0,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        last_sent_at = excluded.last_sent_at,
        -- We already established above that the row is not locked, so a stale
        -- `locked_until` is cleared rather than carried forward.
        locked_until = null;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. الصلاحيات — نفس نهج core_rpc_functions.sql
-- ---------------------------------------------------------------------------

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.mark_phone_verified(uuid)',
    'public.issue_phone_otp(text, text, integer, integer)'
  ]
  loop
    if to_regprocedure(signature) is null then
      continue;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;


-- ==============================================================================
--  17/18 — 20261006000001_inspector_intake_fields.sql
--  حقول طلب الفاحص الجديدة (الاسم الثلاثي، الهوية، الجوال، العمر، الخبرة، الشهادات)
-- ==============================================================================

-- ============================================================================
-- 17 — حقول طلب الانضمام كفاحص (نموذج التقديم المبسّط)
-- ----------------------------------------------------------------------------
-- النموذج صار خطوتين:
--   الخطوة 1 (البيانات الأساسية): الاسم الثلاثي · رقم الهوية · رقم الجوال ·
--                                 سنوات الخبرة + وصفها · العمر · الشهادات (اختياري)
--   الخطوة 2 (التغطية):            المدن · مجالات الفحص · التوفر · المعدات
--
-- الأعمدة القديمة (experience_years · cities · specialties · availability ·
-- has_equipment) تبقى كما هي لأن الخطوة 2 ما زالت تجمعها، وتُستخدم
-- `cities` عند الاعتماد لتحديد تغطية الفاحص.
--
-- الأعمدة الجديدة كلها nullable أو لها default، لأن صفوفًا قديمة قد تسبق هذا
-- الترحيل. `national_id` و`phone` تحديدًا يملؤهما العميل من الطلب لا من الجلسة.
--
-- الترحيل idempotent — يُعاد تشغيله بلا أثر.
-- ============================================================================

alter table public.inspector_applications
  add column if not exists full_name          text    not null default '',
  add column if not exists national_id        text,
  add column if not exists phone              text,
  add column if not exists age                smallint,
  add column if not exists experience_details text    not null default '',
  add column if not exists has_certificates   boolean;

-- قيود النطاق. `add constraint` لا تدعم `if not exists` في PostgreSQL،
-- فتُسوَّر بـDO على pg_constraint لتظلّ إعادة التشغيل آمنة.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inspector_applications_age_range'
  ) then
    alter table public.inspector_applications
      add constraint inspector_applications_age_range
      check (age is null or age between 18 and 70);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'inspector_applications_experience_details_len'
  ) then
    alter table public.inspector_applications
      add constraint inspector_applications_experience_details_len
      check (char_length(experience_details) <= 600);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'inspector_applications_national_id_format'
  ) then
    alter table public.inspector_applications
      add constraint inspector_applications_national_id_format
      check (national_id is null or national_id ~ '^[12][0-9]{9}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'inspector_applications_phone_format'
  ) then
    alter table public.inspector_applications
      add constraint inspector_applications_phone_format
      check (phone is null or phone ~ '^0?5[0-9]{8}$');
  end if;
end;
$$;

-- لوحة المدير تعرض الطلبات مرتّبة بالأحدث ⇒ فهرس يخدم الترتيب مباشرة.
create index if not exists inspector_applications_submitted_at_idx
  on public.inspector_applications (submitted_at desc);

-- ============================================================================
-- الدالة: تُستبدل بتوقيع جديد ⇒ يجب إسقاط القديمة صراحةً،
-- وإلا بقيت نسختان وتصادم نداء RPC بغموض التوقيع.
-- ============================================================================

drop function if exists public.submit_inspector_application(
  uuid, smallint, text[], text[], text, text, boolean, text
);

create or replace function public.submit_inspector_application(
  p_user_id            uuid,
  p_full_name          text,
  p_national_id        text,
  p_phone              text,
  p_age                smallint,
  p_experience_years   smallint,
  p_experience_details text,
  p_has_certificates   boolean,
  p_qualification      text,
  p_cities             text[],
  p_specialties        text[],
  p_availability       text,
  p_has_equipment      boolean,
  p_notes              text
)
returns setof public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.user_profiles%rowtype;
begin
  select * into profile
    from public.user_profiles
    where id = p_user_id
    for update;

  if not found or profile.role = 'admin' then
    raise exception 'Inspector application is not allowed for this account';
  end if;

  if profile.phone is null or profile.inspector_status not in ('none', 'pending', 'rejected') then
    raise exception 'Inspector application cannot be submitted in the current account state';
  end if;

  insert into public.inspector_applications (
    user_id, full_name, national_id, phone, age,
    experience_years, experience_details, has_certificates, qualification,
    cities, specialties, availability, has_equipment, notes, submitted_at
  ) values (
    p_user_id, p_full_name, p_national_id, p_phone, p_age,
    p_experience_years, p_experience_details, p_has_certificates, p_qualification,
    p_cities, p_specialties, p_availability, p_has_equipment, p_notes, now()
  )
  on conflict (user_id) do update set
    full_name          = excluded.full_name,
    national_id        = excluded.national_id,
    phone              = excluded.phone,
    age                = excluded.age,
    experience_years   = excluded.experience_years,
    experience_details = excluded.experience_details,
    has_certificates   = excluded.has_certificates,
    qualification      = excluded.qualification,
    cities             = excluded.cities,
    specialties        = excluded.specialties,
    availability       = excluded.availability,
    has_equipment      = excluded.has_equipment,
    notes              = excluded.notes,
    submitted_at       = excluded.submitted_at;

  update public.user_profiles
    set inspector_status = 'pending'
    where id = p_user_id
    returning * into profile;

  insert into public.audit_events (actor_id, event_type, resource_type, resource_id)
  values (p_user_id, 'inspector.application_submitted', 'user', p_user_id::text);

  return next profile;
end;
$$;

do $$
begin
  if to_regprocedure(
    'public.submit_inspector_application(uuid, text, text, text, smallint, smallint, text, boolean, text, text[], text[], text, boolean, text)'
  ) is null then
    return;
  end if;

  revoke all on function public.submit_inspector_application(
    uuid, text, text, text, smallint, smallint, text, boolean, text, text[], text[], text, boolean, text
  ) from public, anon, authenticated;

  grant execute on function public.submit_inspector_application(
    uuid, text, text, text, smallint, smallint, text, boolean, text, text[], text[], text, boolean, text
  ) to service_role;
end;
$$;


-- ==============================================================================
--  18/18 — 20261007000000_moyasar_payments.sql
--  
-- ==============================================================================

-- ============================================================================
-- 18 — الدفع الإلكتروني عبر Moyasar
-- ----------------------------------------------------------------------------
-- ── لماذا أعمدة مستقلة ولا حالة طلب جديدة ───────────────────────────────────
--
-- `inspections.status` مقيّد بـCHECK، ومفرداته مكرّرة في ثلاثة أماكن:
--   1. قيد CHECK في هذا المخطط (`open … cancelled`)
--   2. `InspectionStatus` في `lib/inspection-store.ts`
--   3. `statusMeta` / `inspectionFlow` / `isActiveStatus` في `lib/inspection-status.ts`
-- ومعه أكثر من ستة مقارنات مباشرة (`=== 'open'` و`'completed'`) في الواجهات
-- ومخازن البيانات. إضافة `'paid'` إلى تلك المفردات كانت ستعني تعديل المواضع
-- الثلاثة كلها، وترك كل مقارنة لم تُعدَّل في حالة خاطئة **بصمت**.
--
-- لذلك الدفع بُعد منفصل: حالة الطلب تبقى كما هي، والدفع يعيش في أعمدة خاصة به.
--
-- ── الحالات ────────────────────────────────────────────────────────────────
--
--   unpaid    — لا محاولة دفع (القيمة الابتدائية، وتشمل كل الصفوف السابقة)
--   initiated — أُنشئت محاولة دفع ولم تُحسم بعد
--   paid      — نجحت العملية وتطابق المبلغ والعملة (الحالة النهائية المرغوبة)
--   failed    — رُفضت العملية، والسبب في `payment_failure_reason`
--   refunded  — أُعيد المبلغ للعميل
--   voided    — أُبطل الحجز قبل التسوية
--
-- ── لماذا `payment_id` بفهرس فريد جزئي ─────────────────────────────────────
--
-- الـWebhook يصل بمعرّف الدفع وحده ولا يعرف الطلب. البحث يتم بـ`payment_id`،
-- لذا تكرار المعرّف بين صفّين يعني تحديث الطلب الخطأ. الفهرس الفريد يمنع ذلك
-- على مستوى القاعدة، وليس في الكود وحده.
--
-- `payment_amount` بالريال (الوحدات الكبرى) لا بالهللات، ليطابق `offers.price`
-- مباشرة عند المقارنة. التحويل إلى هللات (× 100) يحدث عند نداء Moyasar فقط.
--
-- الترحيل idempotent — يُعاد تشغيله بلا أثر.
-- ============================================================================

alter table public.inspections
  add column if not exists payment_status         text not null default 'unpaid',
  add column if not exists payment_id             text,
  add column if not exists payment_amount         numeric(10, 2),
  add column if not exists payment_currency       text not null default 'SAR',
  add column if not exists payment_method         text,
  add column if not exists payment_failure_reason text,
  add column if not exists paid_at                timestamptz;

-- قيود النطاق. `add constraint` لا تدعم `if not exists` في PostgreSQL،
-- فتُسوَّر بـDO على pg_constraint لتظلّ إعادة التشغيل آمنة.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_payment_status_check'
  ) then
    alter table public.inspections
      add constraint inspections_payment_status_check
      check (payment_status in ('unpaid', 'initiated', 'paid', 'failed', 'refunded', 'voided'));
  end if;

  -- مبلغ سالب لا معنى له. NULL مسموح لأنه يعني «لا محاولة دفع بعد».
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_payment_amount_range'
  ) then
    alter table public.inspections
      add constraint inspections_payment_amount_range
      check (payment_amount is null or payment_amount >= 0);
  end if;

  -- `paid` بلا مبلغ أو بلا وقت دفع صفٌّ متناقض: الواجهة تعرض «مدفوع» ثم لا
  -- تجد ما تعرضه. القيد يمنع الحالة النصفية من الأساس.
  if not exists (
    select 1 from pg_constraint where conname = 'inspections_paid_requires_amount'
  ) then
    alter table public.inspections
      add constraint inspections_paid_requires_amount
      check (
        payment_status <> 'paid'
        or (payment_amount is not null and paid_at is not null)
      );
  end if;
end;
$$;

-- الـWebhook يصل بالمعرّف وحده ⇒ البحث به يجب أن يعيد صفًّا واحدًا على الأكثر.
create unique index if not exists inspections_payment_id_key
  on public.inspections (payment_id)
  where payment_id is not null;

-- لوحة الإدارة ترشّح بالحالة والدفع معًا (مثل: «مكتمل وغير مدفوع»).
create index if not exists inspections_payment_status_idx
  on public.inspections (payment_status, created_at desc);

-- ============================================================================
-- الدالة: تسوية الدفع
-- ----------------------------------------------------------------------------
-- سبب وجودها في القاعدة وليس في Node: التسوية قرار «أول كاتب يفوز» على صف
-- واحد. قراءة الحالة في Node ثم الكتابة = سباق مفتوح بين الـWebhook وصفحة
-- العودة (`callback_url`) — كلاهما يصل لنفس الدفعة، وقد يتداخلان فيسجّل
-- `failed` بعد `paid` أو العكس. هنا القفل والفحص والكتابة داخل معاملة واحدة.
--
-- القاعدة الحاكمة: **`paid` نهائية**. لا تُنقَل حالة صفٍّ مدفوع إلى `failed`
-- أو `initiated` أبدًا، مهما وصل من إشعارات متأخرة أو مكرّرة. أما `refunded`
-- و`voided` فمسموح بهما لأنهما تغيّران حقيقيان بعد الدفع.
--
-- تُعيد سطرًا واحدًا: `{ status, previousStatus, changed }`
--   status = 'ok' | 'not_found' | 'already_paid' | 'amount_mismatch' | 'no_accepted_offer'
--
-- المبلغ المتوقّع يُقرأ من **سعر العرض المقبول** (`inspection_offers.price`)
-- لا من قيمة يرسلها المتصفح ولا من عمود مخزَّن، لأن إعدادات نموذج الدفع تُبنى
-- في المتصفح وقابلة للعبث. التفصيل عند موضع الفحص أدناه.
-- ============================================================================

create or replace function public.settle_inspection_payment(
  p_payment_id     text,
  p_payment_status text,
  p_amount         numeric,
  p_currency       text,
  p_method         text,
  p_failure_reason text,
  p_paid_at        timestamptz,
  p_inspection_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target          public.inspections%rowtype;
  next_status     text := p_payment_status;
  prev_status     text;
  expected_amount numeric(10, 2);
begin
  -- المطابقة بالمعرّف أولًا (المسار الطبيعي)، ثم بمعرّف الطلب الوارد في
  -- metadata الدفعة. الثاني هو شبكة الأمان: لو فُقد `callback_url` أو وصل
  -- الإشعار قبل أن يُكتب `payment_id` في الصف، يبقى للدفعة مسار إلى طلبها.
  select * into target
    from public.inspections
    where (p_payment_id is not null and payment_id = p_payment_id)
       or (p_inspection_id is not null and id = p_inspection_id)
    order by (payment_id = p_payment_id) desc nulls last
    limit 1
    for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  prev_status := target.payment_status;

  -- الحماية الأهم: لا تراجع عن `paid`.
  if prev_status = 'paid' and next_status not in ('refunded', 'voided') then
    return jsonb_build_object(
      'status', 'already_paid',
      'previousStatus', prev_status,
      'changed', false
    );
  end if;

  -- ── التحقق من المبلغ عند أول تسوية ناجحة فقط ──────────────────────────────
  --
  -- المرجع ليس قيمة مخزّنة في الصف، بل **سعر العرض المقبول** المقروء الآن من
  -- `inspection_offers`. السبب: إعدادات نموذج Moyasar تُبنى في المتصفح، فيمكن
  -- لعميل عبث بها أن يدفع ريالًا واحدًا. المبلغ الوحيد الذي نثق به هو الذي
  -- اتّفق عليه الطرفان في القاعدة.
  --
  -- غياب عرض مقبول = لا مرجع = لا يجوز وسم الطلب مدفوعًا. الرفض هنا مقصود:
  -- الدفع يجري على سعر عرض مقبول، لا على طلب مفتوح بلا سعر متّفق عليه.
  if next_status = 'paid' and prev_status <> 'paid' then
    select o.price into expected_amount
      from public.inspection_offers o
      where o.id = target.accepted_offer_id;

    if expected_amount is null then
      return jsonb_build_object(
        'status', 'no_accepted_offer',
        'previousStatus', prev_status,
        'inspectionId', target.id
      );
    end if;

    if p_amount is null or p_amount <> expected_amount then
      return jsonb_build_object(
        'status', 'amount_mismatch',
        'previousStatus', prev_status,
        'expected', expected_amount,
        'received', p_amount
      );
    end if;

    if p_currency is not null and upper(p_currency) <> upper(target.payment_currency) then
      return jsonb_build_object(
        'status', 'amount_mismatch',
        'previousStatus', prev_status,
        'expected', target.payment_currency,
        'received', p_currency
      );
    end if;
  end if;

  -- `p_*` قيم اختيارية: لا تُمسح قيمة موجودة بقيمة غائبة.
  update public.inspections
    set payment_status = next_status,
        payment_id = coalesce(p_payment_id, payment_id),
        payment_amount = coalesce(p_amount, payment_amount),
        payment_currency = coalesce(upper(p_currency), payment_currency),
        payment_method = coalesce(p_method, payment_method),
        payment_failure_reason = case
          when next_status = 'failed' then coalesce(p_failure_reason, payment_failure_reason)
          when next_status = 'paid' then null
          else payment_failure_reason
        end,
        paid_at = case
          when next_status = 'paid' then coalesce(p_paid_at, paid_at, now())
          else paid_at
        end
    where id = target.id;

  return jsonb_build_object(
    'status', 'ok',
    'previousStatus', prev_status,
    'changed', prev_status is distinct from next_status,
    'inspectionId', target.id
  );
end;
$$;

do $$
begin
  if to_regprocedure(
    'public.settle_inspection_payment(text, text, numeric, text, text, text, timestamptz, text)'
  ) is null then
    return;
  end if;

  revoke all on function public.settle_inspection_payment(
    text, text, numeric, text, text, text, timestamptz, text
  ) from public, anon, authenticated;

  grant execute on function public.settle_inspection_payment(
    text, text, numeric, text, text, text, timestamptz, text
  ) to service_role;
end;
$$;

-- ============================================================================
-- تحقّق
-- ============================================================================
do $$
declare
  n_cols integer;
begin
  select count(*) into n_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inspections'
      and column_name in (
        'payment_status', 'payment_id', 'payment_amount', 'payment_currency',
        'payment_method', 'payment_failure_reason', 'paid_at'
      );

  if n_cols <> 7 then
    raise exception 'Moyasar payment migration incomplete: expected 7 columns, found %', n_cols;
  end if;

  raise notice 'Moyasar payment columns ready (%/7)', n_cols;
end;
$$;

-- ==============================================================================
--  التحقق بعد التشغيل — آخر استعلام هو ما يعرضه محرر SQL
-- ==============================================================================

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
