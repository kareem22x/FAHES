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
