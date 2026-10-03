-- =============================================================================
-- admin_audit_logs — compatibility view over the existing audit trail
-- =============================================================================
--
-- NON-DESTRUCTIVE BY DESIGN.
--   * Creates a VIEW only. No table is dropped, altered or renamed.
--   * No column of any existing table is touched.
--   * Re-running this file is safe (CREATE OR REPLACE).
--
-- WHY A VIEW AND NOT A NEW TABLE
--   The platform already has `public.audit_events`, which is append-only:
--   a BEFORE UPDATE/DELETE trigger raises, so rows physically cannot be edited
--   or deleted — not even by the service role. Creating a second table would
--   duplicate the same data and introduce a second, weaker write path.
--
--   This view exposes the same rows under the column names the admin console
--   specification asks for, so both vocabularies work:
--
--     spec name        ->  actual column
--     admin_id         ->  actor_id      (user_profiles.id of the acting admin)
--     action_type      ->  event_type    (e.g. 'admin.user_role_changed')
--     target_type      ->  resource_type
--     target_id        ->  resource_id
--     metadata         ->  metadata
--     "timestamp"      ->  created_at
--
-- APPLY WITH:
--   Supabase Dashboard -> SQL Editor -> paste -> Run
--   (or `supabase db push` if the project is linked to a database)

create or replace view public.admin_audit_logs as
select
  id,
  actor_id      as admin_id,
  event_type    as action_type,
  resource_type as target_type,
  resource_id   as target_id,
  metadata,
  created_at    as "timestamp"
from public.audit_events;

comment on view public.admin_audit_logs is
  'Read-only compatibility view over audit_events using the admin_id/action_type/target_id/timestamp naming. Append-only: the underlying table rejects UPDATE and DELETE.';

-- The view is read-only for the API roles; writes must go through audit_events
-- so the append-only trigger always applies.
revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to service_role;
