create extension if not exists pgcrypto;

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null default 'عميل',
  role text not null default 'customer'
    check (role in ('customer', 'inspector', 'admin')),
  inspector_status text not null default 'none'
    check (inspector_status in ('none', 'pending', 'approved', 'rejected', 'suspended')),
  inspector_cities text[] not null default '{}',
  is_online boolean not null default false,
  inspector_profile_updated_at timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table public.inspections (
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

create table public.inspection_offers (
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

alter table public.inspections
  add constraint inspections_accepted_offer_fk
  foreign key (accepted_offer_id) references public.inspection_offers(id) on delete restrict;

create table public.otp_challenges (
  phone text primary key,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  locked_until timestamptz
);
create index otp_challenges_expiry_idx on public.otp_challenges(expires_at);

create table public.rate_limits (
  bucket_hash text primary key,
  hit_count integer not null check (hit_count > 0),
  reset_at timestamptz not null
);
create index rate_limits_reset_idx on public.rate_limits(reset_at);

create table public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null unique references public.inspections(id) on delete cascade,
  inspector_id uuid not null references public.user_profiles(id) on delete restrict,
  checklist jsonb not null default '{}'::jsonb,
  notes text not null default '',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inspection_media (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(id) on delete cascade,
  inspector_id uuid not null references public.user_profiles(id) on delete restrict,
  object_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  category text not null default ''
    check (category in ('صور خارجية', 'صور داخلية', 'المحرك', 'الشاص', 'الإطارات')),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.user_profiles(id) on delete set null,
  event_type text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index inspections_customer_created_idx on public.inspections(customer_id, created_at desc);
create index inspections_open_city_schedule_idx on public.inspections(city, scheduled_at) where status = 'open';
create index inspections_assigned_schedule_idx on public.inspections(assigned_inspector_id, scheduled_at) where assigned_inspector_id is not null;
create index inspection_offers_inspection_idx on public.inspection_offers(inspection_id, created_at);
create index inspection_reports_inspector_idx on public.inspection_reports(inspector_id, updated_at desc);
create index inspection_media_inspection_idx on public.inspection_media(inspection_id, created_at);
create index audit_events_resource_idx on public.audit_events(resource_type, resource_id, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_offers enable row level security;
alter table public.otp_challenges enable row level security;
alter table public.rate_limits enable row level security;
alter table public.inspection_reports enable row level security;
alter table public.inspection_media enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.user_profiles, public.inspections, public.inspection_offers,
  public.otp_challenges, public.rate_limits, public.inspection_reports,
  public.inspection_media, public.audit_events from anon, authenticated;
grant all on public.user_profiles, public.inspections, public.inspection_offers,
  public.otp_challenges, public.rate_limits, public.inspection_reports,
  public.inspection_media, public.audit_events to service_role;
grant usage, select on sequence public.audit_events_id_seq to service_role;

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

revoke all on function public.upsert_user_from_login(text, boolean) from public, anon, authenticated;
revoke all on function public.verify_otp_challenge(text, text, integer, bigint) from public, anon, authenticated;
revoke all on function public.store_otp_challenge(text, text, integer) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, integer, bigint) from public, anon, authenticated;
revoke all on function public.submit_inspection_offer(text, uuid, text, numeric, text, text[]) from public, anon, authenticated;
revoke all on function public.accept_inspection_offer(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.advance_inspection_status(text, uuid, text) from public, anon, authenticated;
revoke all on function public.save_inspection_report(text, uuid, jsonb, text, boolean, text[], text[]) from public, anon, authenticated;
grant execute on function public.upsert_user_from_login(text, boolean) to service_role;
grant execute on function public.verify_otp_challenge(text, text, integer, bigint) to service_role;
grant execute on function public.store_otp_challenge(text, text, integer) to service_role;
grant execute on function public.consume_rate_limit(text, integer, bigint) to service_role;
grant execute on function public.submit_inspection_offer(text, uuid, text, numeric, text, text[]) to service_role;
grant execute on function public.accept_inspection_offer(text, uuid, uuid) to service_role;
grant execute on function public.advance_inspection_status(text, uuid, text) to service_role;
grant execute on function public.save_inspection_report(text, uuid, jsonb, text, boolean, text[], text[]) to service_role;
