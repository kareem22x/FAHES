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
  flagged_categories text[] not null default '{}',
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
  evidence_urls text[] not null default '{}',
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
  target_cities text[] not null default '{}'::jsonb, -- فارغ = كل المدن
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
  issues text[] not null default '{}',
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
