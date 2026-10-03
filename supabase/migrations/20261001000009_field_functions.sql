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
