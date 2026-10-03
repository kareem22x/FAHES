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
