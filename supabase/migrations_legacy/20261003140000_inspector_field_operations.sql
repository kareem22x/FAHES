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
