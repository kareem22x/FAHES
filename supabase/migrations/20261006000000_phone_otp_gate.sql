-- ============================================================================
-- 06 — بوابة توثيق الجوال: طبقة الإنفاذ فوق OTP الموجود
-- ----------------------------------------------------------------------------
-- `otp_challenges` and its two RPCs (`store_otp_challenge`,
-- `verify_otp_challenge`) already exist from the core schema. They are keyed by
-- *phone* and already handle expiry, attempt counting and lockout.
--
-- This migration does NOT introduce a second, parallel OTP table. It adds only
-- what the phone gate needs on top:
--
--   1. `user_profiles.phone_verified` / `phone_verified_at` — the single flag the
--      route gatekeeper keys off. Added idempotently so this migration is valid
--      whether or not migration 05 has been applied.
--
--   2. `mark_phone_verified(uuid)` — flips the flag and writes the audit row in
--      one transaction. Redefined here so this file is self-sufficient.
--
--   3. `issue_phone_otp(phone, code_hash, expiry_minutes, cooldown_seconds)` —
--      a resend-cooldown-aware wrapper over `otp_challenges`. The core
--      `store_otp_challenge` deliberately has no cooldown; the spec requires a
--      60-second one, and enforcing it needs a read-then-write under the same row
--      lock, which is exactly what this function does.
--
-- Verification continues to go through the core `verify_otp_challenge`; the API
-- route calls it and, on `valid`, calls `mark_phone_verified`. Keeping the two
-- separate is deliberate: `verify_otp_challenge` is phone-keyed and knows nothing
-- about accounts, while `mark_phone_verified` is account-keyed.
--
-- Idempotent throughout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. عمود البوابة
-- ---------------------------------------------------------------------------

alter table public.user_profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz;

-- Backfill so enabling the gate does not lock out accounts that already hold a
-- Clerk-verified phone. `lib/auth.ts` only ever stores a verified number.
update public.user_profiles
  set phone_verified = true,
      phone_verified_at = coalesce(phone_verified_at, now())
  where phone is not null
    and phone_verified = false;

create index if not exists user_profiles_phone_verified_idx
  on public.user_profiles (phone_verified)
  where phone_verified = false;

-- ---------------------------------------------------------------------------
-- 2. قلب العلم + سجل التدقيق — في معاملة واحدة
-- ---------------------------------------------------------------------------

create or replace function public.mark_phone_verified(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.user_profiles
    set phone_verified = true,
        phone_verified_at = coalesce(phone_verified_at, now())
    where id = p_user_id
      and phone is not null;

  get diagnostics affected = row_count;
  if affected = 0 then
    return false;
  end if;

  insert into public.audit_events (actor_id, event_type, resource_type, resource_id)
  values (p_user_id, 'user.phone_verified', 'user', p_user_id::text);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. إصدار رمز جديد مع فرض المهلة الزمنية لإعادة الإرسال
-- ---------------------------------------------------------------------------

create or replace function public.issue_phone_otp(
  p_phone text,
  p_code_hash text,
  p_expiry_minutes integer,
  p_cooldown_seconds integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.otp_challenges%rowtype;
  now_at timestamptz := now();
begin
  select * into existing
    from public.otp_challenges
    where phone = p_phone
    for update;

  if found then
    if existing.locked_until is not null and existing.locked_until > now_at then
      return 'locked';
    end if;
    if existing.last_sent_at is not null
       and now_at < existing.last_sent_at + make_interval(secs => p_cooldown_seconds) then
      return 'cooldown';
    end if;
  end if;

  -- Opportunistic prune, matching the policy in `store_otp_challenge`.
  delete from public.otp_challenges
    where expires_at < now_at - interval '1 day'
      and (locked_until is null or locked_until <= now_at);

  insert into public.otp_challenges
    (phone, code_hash, attempts, created_at, expires_at, last_sent_at, locked_until)
  values
    (p_phone, p_code_hash, 0, now_at, now_at + make_interval(mins => p_expiry_minutes), now_at, null)
  on conflict (phone) do update
    set code_hash = excluded.code_hash,
        attempts = 0,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        last_sent_at = excluded.last_sent_at,
        -- We already established above that the row is not locked, so a stale
        -- `locked_until` is cleared rather than carried forward.
        locked_until = null;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. الصلاحيات — نفس نهج core_rpc_functions.sql
-- ---------------------------------------------------------------------------

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.mark_phone_verified(uuid)',
    'public.issue_phone_otp(text, text, integer, integer)'
  ]
  loop
    if to_regprocedure(signature) is null then
      continue;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end;
$$;
