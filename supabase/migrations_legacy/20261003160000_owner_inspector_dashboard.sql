-- ============================================================================
-- فاحص — تفعيل لوحة الفاحصين لحساب المالك
-- ----------------------------------------------------------------------------
-- الصق هذا الملف كاملًا في: Supabase Dashboard → SQL Editor → New query → Run
--
-- لماذا هذا الملف؟
--
--   المشروع يحتوي الترحيل `20261001120000_inspector_device_lock.sql` لكنه
--   **لم يُطبَّق** على قاعدة البيانات الحيّة. تحقّقنا فعليًا:
--
--     GET /rest/v1/inspector_devices
--       → PGRST205  "Could not find the table 'public.inspector_devices'"
--     POST /rest/v1/rpc/bind_inspector_device
--       → PGRST202  "Could not find the function public.bind_inspector_device"
--
--   نتيجةً لذلك: كل نداء لـ`/api/inspectors/device` يعيد 503
--   (`migration_required`)، فيظهر للفاحص — وللمالك — «هذا الجهاز غير مصرّح»
--   بدل لوحة التحكم.
--
-- ما الذي يفعله هذا الملف؟
--
--   1. ينشئ جدول `inspector_devices` إن لم يكن موجودًا.
--   2. ينشئ دالة `bind_inspector_device` — مع تعديل واحد: تقبل **مالك المنصة**
--      بدل أن تردّ عليه `not_inspector`.
--   3. ينشئ دالة `revoke_inspector_device` وجعل سجل التدقيق غير قابل للتعديل.
--   4. يرقّي صف المالك: `inspector_status = 'approved'` + المدن الخمس.
--
-- آمن للتشغيل أكثر من مرة (idempotent بالكامل).
--
-- ⚠️ ما لا يفعله: لا يمنح أي حساب آخر صلاحية فاحص، ولا يمسّ صفوف الفاحصين
--    الحقيقيين، ولا يعطّل قفل الجهاز عنهم.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. التأكد من وجود أعمدة الاعتماد المطلوبة (تصحيح وقائي)
-- ----------------------------------------------------------------------------

alter table public.user_profiles
  add column if not exists inspector_status text not null default 'none',
  add column if not exists inspector_cities text[] not null default '{}',
  add column if not exists is_online boolean not null default false;

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
-- الفرق الوحيد عن الترحيل الأصلي: بند `not_inspector` أصبح يستثني مالك المنصة.
-- السطر المعدَّل مُعلَّم بـ«▼ تعديل» أدناه.
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

  -- ▼ تعديل: هل هذا الحساب مالك منصة؟ يُقرأ من نفس الجدول، بلا أي مصدر خارجي.
  is_owner := profile.role = 'admin';

  -- الفاحص المعتمد يمرّ. المالك يمرّ أيضًا بصفته مالكًا — لا بصفته فاحصًا.
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

-- ---------------------------------------------------------------------------
-- 5. ترقية صف المالك
-- ----------------------------------------------------------------------------
-- لماذا يلزم هذا أصلًا؟
--
--   `getSession()` تحسم الدور هكذا:
--       isAdmin ? (elevated ? 'admin' : 'admin_pending')
--               : inspectorStatus === 'approved' ? 'inspector' : 'customer'
--   أي أن المالك **لا يمكن أن يُحلّ إلى `inspector` أبدًا**.
--
--   لهذا وُجد وضع «الدخول كمفتش» (الكوكي الموقّع fahes_inspector_view)، وهو
--   يجعل صفحات الفاحص وواجهاتها البرمجية تمرّ. لكن لوحة التحكم المكتبية تقرأ
--   أيضًا بيانات الفاحص نفسه: مدنه، وحالته، وقائمة الطلبات. بدون
--   `inspector_status = 'approved'` ومدن محدَّدة، ستُفتح الصفحة لكنها ستبقى
--   فارغة — قشرة بلا محتوى.
--
--   الملاحظة الأمنية: هذا لا يمنح الحساب سلوك فاحص عاديّ. الوضع المزدوج يبقى
--   محصورًا في مسارات الفاحص، وكل مسار يخصّ فحصًا بعينه يظل يتحقق من ملكيته.
--
-- ⚠️ إن أردت تخطّي هذه الخطوة: احذف هذا القسم. ستعمل اللوحة لكنها ستبدو فارغة.
-- ----------------------------------------------------------------------------

-- ⚠️ ملاحظة: الجدول الحيّ `user_profiles` لا يحتوي عمود `updated_at` (تحقّقنا
--    فعليًا: الأعمدة الزمنية هي created_at, last_login_at,
--    inspector_profile_updated_at). لذلك نستخدم `inspector_profile_updated_at`.
--    أُضيف العمود هنا بالاحتياط كي لا يفشل الملف على قاعدة أحدث/أقدم.
-- ----------------------------------------------------------------------------

alter table public.user_profiles
  add column if not exists inspector_profile_updated_at timestamptz;

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

-- شبكة أمان: إن لم يُصَب أي صف (مثلًا اختلف معرّف Clerk)، حدِّثه مباشرة.
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
-- 6. تصريح الوصول (deny-by-default) — يُعاد تأكيده ليكون الملف مكتملًا
-- ----------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'user_profiles', 'inspections', 'inspection_offers', 'otp_challenges',
    'rate_limits', 'inspection_reports', 'inspection_media', 'audit_events',
    'inspector_applications', 'inspector_devices'
  ]
  loop
    -- تخطَّ الجداول غير الموجودة بدل الفشل. القاعدة الحيّة لم تُبنَ عبر الـCLI
    -- وتنقصها جداول من ترحيلات لم تُنفَّذ (تحقّقنا: inspector_applications غير
    -- موجودة). الفشل هنا كان سيُوقف الملف كله لأجل جدول لا علاقة له بالمهمة.
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

-- ============================================================================
-- التحقق — نفّذ هذه الاستعلامات بعد التشغيل وتأكّد من النتيجة المتوقعة
-- ============================================================================

-- (أ) الجدول والدالة أصبحا موجودين؟
--     select to_regclass('public.inspector_devices') as table_ok,
--            to_regprocedure('public.bind_inspector_device(uuid,text,text,text,text)') as fn_ok;
--     -- المتوقع: inspector_devices | bind_inspector_device

-- (ب) هل صار المالك فاحصًا معتمدًا؟
--     select name, role, inspector_status, inspector_cities
--       from public.user_profiles
--      where clerk_user_id = 'user_3K3C1Rawe2bnwDKHtUeDanSXMdC';
--     -- المتوقع: role=admin | inspector_status=approved | المدن الخمس

-- (ج) هل الوصول مقصور على service_role؟ (المتوقع: صفر صفوف)
--     select grantee, privilege_type from information_schema.role_table_grants
--      where table_schema = 'public'
--        and table_name = 'inspector_devices'
--        and grantee in ('anon', 'authenticated');
