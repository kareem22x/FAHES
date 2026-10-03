-- ============================================================================
-- Inspector device lock + immutable audit trail
-- ----------------------------------------------------------------------------
-- Authorization model in this project (unchanged, restated for clarity):
--
--   * Every table already has RLS enabled and ALL privileges are revoked from
--     `anon` and `authenticated`. Only `service_role` can read or write, and
--     it is used exclusively from server-only modules (`lib/supabase/server.ts`).
--     That is stricter than granting `authenticated` narrow RLS policies: a
--     leaked publishable/anon key can read nothing at all.
--   * Role checks (`customer` / `inspector` / `admin`) happen server-side in
--     `lib/auth.ts` and per-route in `app/api/**`, on top of Clerk identity.
--
-- This migration therefore adds the pieces that were missing rather than
-- re-doing what exists: the inspector device lock, and enforcement that the
-- audit trail cannot be rewritten.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Inspector devices
-- ---------------------------------------------------------------------------

create table public.inspector_devices (
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

-- One active binding per inspector; the same device may be re-registered after
-- a revocation, so the uniqueness is scoped to non-revoked rows.
create unique index inspector_devices_active_binding_idx
  on public.inspector_devices(inspector_id)
  where revoked_at is null;

create index inspector_devices_lookup_idx
  on public.inspector_devices(inspector_id, device_hash)
  where revoked_at is null;

alter table public.inspector_devices enable row level security;
revoke all on public.inspector_devices from public, anon, authenticated;
grant all on public.inspector_devices to service_role;

comment on table public.inspector_devices is
  'Phones bound to an approved inspector. One active row per inspector (partial unique index). Only service_role may read or write.';

-- ---------------------------------------------------------------------------
-- 2. Bind / verify an inspector device (single transaction, race-safe)
-- ---------------------------------------------------------------------------

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
begin
  -- Defence in depth: the API validates this too, but the database is the
  -- last line and must not store an unvalidated fingerprint.
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into profile
    from public.user_profiles
    where id = p_inspector_id;

  if not found
     or profile.role <> 'inspector'
     or profile.inspector_status <> 'approved' then
    return jsonb_build_object('status', 'not_inspector');
  end if;

  -- Two phones racing to claim the same inspector account must not both win.
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

  -- Any other active device means the account is already locked elsewhere.
  select * into bound
    from public.inspector_devices
    where inspector_id = p_inspector_id
      and revoked_at is null
    order by first_seen_at
    limit 1;

  if found then
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
-- 3. Admin-only device revocation (audited)
-- ---------------------------------------------------------------------------

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
-- 4. Make the audit trail genuinely append-only
-- ----------------------------------------------------------------------------
-- Until now "immutable" was a convention. This trigger makes it a guarantee:
-- no role, including service_role, can update or delete an audit row.

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
-- 5. Re-assert the deny-by-default posture (idempotent)
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
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public, anon, authenticated', target);
    execute format('grant all on public.%I to service_role', target);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select tablename, rowsecurity, forcerowsecurity
--     from pg_tables where schemaname = 'public' order by tablename;
--   -- expect rowsecurity = true and forcerowsecurity = true for every row
--
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated');
--   -- expect zero rows
-- ---------------------------------------------------------------------------
