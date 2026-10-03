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
