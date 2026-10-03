-- =============================================================================
-- OPTIONAL — deny-by-default row level security
-- =============================================================================
--
-- READ THIS BEFORE RUNNING.
--
-- This app never uses the Supabase anon key. Every database read and write goes
-- through the server (`lib/supabase/server.ts`) with the service-role secret,
-- and the service role bypasses RLS entirely. There is no `NEXT_PUBLIC_SUPABASE_*`
-- key in this project at all.
--
-- That means enabling RLS with NO policies locks out anonymous and authenticated
-- API access completely while leaving the application working exactly as it does
-- today. It is pure defence in depth: if an anon key is ever added or leaked,
-- it grants nothing.
--
-- WHY IT IS OPT-IN
--   `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` changes table state, and the
--   project brief forbids altering existing tables without explicit sign-off.
--   It is non-destructive (no data is touched, no column is changed) and it is
--   fully reversible with DISABLE ROW LEVEL SECURITY — but it is still an ALTER,
--   so it is shipped separately for you to decide on.
--
-- PREREQUISITE: verify no client-side Supabase usage exists before applying.
--   grep -rn "NEXT_PUBLIC_SUPABASE" --include=*.ts --include=*.tsx .
--
-- APPLY WITH: Supabase Dashboard -> SQL Editor -> paste -> Run

alter table public.user_profiles          enable row level security;
alter table public.inspections            enable row level security;
alter table public.inspection_offers      enable row level security;
alter table public.inspection_reports     enable row level security;
alter table public.inspection_media       enable row level security;
alter table public.inspector_applications enable row level security;
alter table public.inspector_devices      enable row level security;
alter table public.audit_events           enable row level security;
alter table public.rate_limits            enable row level security;
alter table public.otp_challenges         enable row level security;

-- No policies are created on purpose: deny by default for anon/authenticated.
-- The service role used by the server continues to bypass RLS.

-- TO REVERT:
--   alter table public.<name> disable row level security;
