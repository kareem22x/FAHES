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
