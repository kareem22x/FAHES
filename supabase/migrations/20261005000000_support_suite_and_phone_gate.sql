-- ============================================================================
-- 05 — بوابة توثيق الجوال + مجموعة تذاكر الدعم الفني
-- ----------------------------------------------------------------------------
-- Fundamentals this migration establishes:
--
--   1. `user_profiles.phone_verified` — the single flag the route gatekeeper
--      (see `proxy.ts`) keys off. Backfilled for every account that already has
--      a Clerk-verified phone, so existing users are not locked out by the
--      change that introduces the gate.
--
--   2. `notifications` — the feed behind the inspector dashboard bell.
--
--   3. The support ticketing suite: tickets, threaded messages, an append-only
--      event log, and admin canned responses.
--
-- ── On RLS ──────────────────────────────────────────────────────────────────
-- This schema follows the project's existing convention (`core_schema.sql`):
-- RLS is *forced* and anon/authenticated are revoked outright, so no browser
-- ever queries these tables. Every read and write goes through the service role
-- in a server component or route handler, where ownership is checked against
-- the session. We deliberately do not add permissive `create policy` rules for
-- anon/authenticated: doing so would widen access compared with today, not
-- narrow it. The `create policy` statements below are therefore omitted by
-- design, not by oversight — see the README in this directory.
--
-- Idempotent throughout (`if not exists` / `or replace`), so it can be re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. توثيق الجوال — عمود واحد يحكم البوابة
-- ---------------------------------------------------------------------------

alter table public.user_profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz;

-- Backfill: an account that already carries a phone has one that Clerk verified
-- during sign-up (`verifiedPhoneNumber()` in `lib/auth.ts` only ever returns a
-- verified number). Without this, enabling the gate would sign every existing
-- user out to a wall they cannot pass.
update public.user_profiles
  set phone_verified = true,
      phone_verified_at = coalesce(phone_verified_at, now())
  where phone is not null
    and phone_verified = false;

create index if not exists user_profiles_phone_verified_idx
  on public.user_profiles (phone_verified)
  where phone_verified = false;

-- ---------------------------------------------------------------------------
-- 2. الإشعارات — مصدر جرس لوحة الفاحص
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null
    check (kind in ('request', 'schedule', 'report', 'payment', 'system', 'support')),
  severity text not null default 'info'
    check (severity in ('info', 'success', 'warning', 'critical')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 1000),
  href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The bell reads "newest unread for this user" on every dashboard load, so the
-- partial index keeps that query off the full table as the feed grows.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. تذاكر الدعم — الجداول الأربعة
-- ---------------------------------------------------------------------------

-- Human-readable ticket reference (`FAH-000123`). A sequence rather than
-- `count(*)` so two concurrent inserts can never collide on the same number.
create sequence if not exists public.support_ticket_number_seq;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique
    default 'FAH-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0'),
  requester_id uuid not null references public.user_profiles(id) on delete cascade,
  requester_role text not null default 'customer'
    check (requester_role in ('customer', 'inspector', 'admin')),
  subject text not null check (char_length(subject) between 3 and 200),
  category text not null
    check (category in (
      'inspection_issue', 'payment', 'app_bug', 'account_lock', 'other'
    )),
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),
  status text not null default 'open'
    check (status in (
      'open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'
    )),
  body text not null check (char_length(body) between 1 and 4000),
  inspection_id text references public.inspections(id) on delete set null,
  assigned_to uuid references public.user_profiles(id) on delete set null,
  -- Captured client-side at submit time. Debugging a field bug without the
  -- device that produced it is guesswork, and the inspector will have closed
  -- the app long before anyone reads the ticket.
  device_info jsonb not null default '{}'::jsonb,
  -- Optional last-known position; only ever set for field inspectors (feature 30).
  latitude double precision,
  longitude double precision,
  escalated_to text check (escalated_to in ('admin', 'operations')),
  escalated_at timestamptz,
  first_response_at timestamptz,
  -- Set on insert from the priority table below; drives the SLA breach warning.
  sla_due_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  -- While `now() < reopen_deadline` a user reply re-opens the ticket (feature 38).
  reopen_deadline timestamptz,
  satisfaction_rating smallint check (satisfaction_rating between 1 and 5),
  satisfaction_note text not null default '' check (char_length(satisfaction_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_open_idx
  on public.support_tickets (priority, created_at)
  where status in ('open', 'in_progress', 'waiting_for_user');

create index if not exists support_tickets_requester_idx
  on public.support_tickets (requester_id, created_at desc);

create index if not exists support_tickets_assignee_idx
  on public.support_tickets (assigned_to, status)
  where assigned_to is not null;

-- Drives the red "unanswered for > 15 minutes" highlight (feature 21).
create index if not exists support_tickets_sla_idx
  on public.support_tickets (sla_due_at)
  where first_response_at is null and status in ('open', 'in_progress');

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.user_profiles(id) on delete cascade,
  author_role text not null check (author_role in ('customer', 'inspector', 'admin')),
  body text not null default '' check (char_length(body) <= 8000),
  -- Admin-only thread (feature 19). Never serialised toward a non-admin caller.
  is_internal boolean not null default false,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint check (attachment_size is null or attachment_size > 0),
  -- Field voice notes (feature 29).
  audio_path text,
  audio_duration_seconds integer
    check (audio_duration_seconds is null or audio_duration_seconds between 1 and 600),
  -- Soft delete so message deletions stay auditable (feature 28).
  deleted_at timestamptz,
  deleted_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint support_ticket_messages_not_empty
    check (body <> '' or attachment_path is not null or audio_path is not null)
);

create index if not exists support_ticket_messages_thread_idx
  on public.support_ticket_messages (ticket_id, created_at);

-- Append-only trail of everything that happened to a ticket. Feature 28 wants
-- re-assignments and deletions in `audit_events` as well; those are written
-- there too (see `lib/support/store.ts`), while this table keeps the
-- ticket-scoped history the detail page renders as a status timeline.
create table if not exists public.support_ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid references public.user_profiles(id) on delete set null,
  event_type text not null
    check (event_type in (
      'created', 'status_changed', 'assigned', 'reassigned', 'escalated',
      'reopened', 'sla_breached', 'message_deleted', 'rated'
    )),
  from_value text,
  to_value text,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_events_ticket_idx
  on public.support_ticket_events (ticket_id, created_at);

-- Pre-written agent replies (feature 20). Seeded below with the three the spec
-- calls out explicitly; more can be added from the console without a migration.
create table if not exists public.support_canned_responses (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(label) between 2 and 120),
  body text not null check (char_length(body) between 2 and 4000),
  category text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. إغلاق الوصول المباشر — نفس نهج core_schema.sql
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'notifications', 'support_tickets', 'support_ticket_messages',
    'support_ticket_events', 'support_canned_responses'
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

  -- The ticket-number sequence is read at INSERT time, so the service role needs
  -- USAGE on it explicitly; `grant all on table` does not cover sequences.
  if to_regclass('public.support_ticket_number_seq') is not null then
    revoke all on sequence public.support_ticket_number_seq from public, anon, authenticated;
    grant usage, select on sequence public.support_ticket_number_seq to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. الدوال — كل ما يجب أن يكون ذرّيًا
-- ---------------------------------------------------------------------------

-- Sets the gate flag. Kept as an RPC (rather than an `update` from the route)
-- so the audit row is written in the same transaction as the flag: a verified
-- phone with no trail, or a trail with no flag, are both unacceptable.
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
        phone_verified_at = now()
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

-- Atomic grab of an unassigned ticket. The `for update` is what makes two
-- agents clicking "claim" at the same moment safe: the second one sees the
-- first's assignment and gets `already_assigned` instead of silently stealing.
create or replace function public.claim_support_ticket(p_ticket_id uuid, p_admin_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assignee uuid;
  ticket_status text;
begin
  select assigned_to, status
    into current_assignee, ticket_status
    from public.support_tickets
    where id = p_ticket_id
    for update;

  if not found then
    return 'not_found';
  end if;

  if ticket_status in ('resolved', 'closed') then
    return 'closed';
  end if;

  if current_assignee is not null and current_assignee <> p_admin_id then
    return 'already_assigned';
  end if;

  update public.support_tickets
    set assigned_to = p_admin_id, updated_at = now()
    where id = p_ticket_id;

  insert into public.support_ticket_events (ticket_id, actor_id, event_type, to_value)
  values (
    p_ticket_id,
    p_admin_id,
    case when current_assignee is null then 'assigned' else 'reassigned' end,
    p_admin_id::text
  );

  return 'ok';
end;
$$;

-- Re-opens a ticket the user replies to inside the 48-hour window (feature 38).
-- Returns a verdict string so the caller can distinguish "too late" from
-- "someone else's ticket" without parsing an error.
create or replace function public.reopen_support_ticket(p_ticket_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
begin
  select requester_id, status, reopen_deadline
    into target
    from public.support_tickets
    where id = p_ticket_id
    for update;

  if not found then
    return 'not_found';
  end if;

  if target.requester_id <> p_user_id then
    return 'forbidden';
  end if;

  if target.status not in ('resolved', 'closed') then
    return 'not_closed';
  end if;

  if target.reopen_deadline is null or now() > target.reopen_deadline then
    return 'window_expired';
  end if;

  update public.support_tickets
    set status = 'open',
        resolved_at = null,
        closed_at = null,
        updated_at = now()
    where id = p_ticket_id;

  insert into public.support_ticket_events (ticket_id, actor_id, event_type, from_value, to_value)
  values (p_ticket_id, p_user_id, 'reopened', target.status, 'open');

  return 'ok';
end;
$$;

-- Functions are only ever called by the service role from a server route, so
-- EXECUTE is granted there and revoked from the browser-facing roles — the same
-- shape used for every other RPC in this schema.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.mark_phone_verified(uuid)',
    'public.claim_support_ticket(uuid, uuid)',
    'public.reopen_support_ticket(uuid, uuid)'
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

-- ---------------------------------------------------------------------------
-- 6. الردود الجاهزة + بيانات أولية
-- ---------------------------------------------------------------------------

insert into public.support_canned_responses (label, body, category) values
  (
    'سياسة الاسترداد',
    'شكرًا لتواصلك. المبالغ المستردة تُعاد إلى وسيلة الدفع نفسها خلال 5 إلى 7 أيام عمل بعد اعتماد الطلب. لا نحتفظ ببيانات البطاقة على منصتنا، وستصلك رسالة تأكيد فور تنفيذ الاسترداد.',
    'payment'
  ),
  (
    'إصلاح الموقع (GPS)',
    'يبدو أن إحداثياتك غير دقيقة. من فضلك افتح إعدادات الجهاز، ثم التطبيقات، ثم تطبيق فاحص، واختر الصلاحيات وفعّل «الموقع أثناء الاستخدام»، ثم أعد فتح لوحة الميدان. إن استمرت المشكلة أرسل لقطة شاشة وسنراجعها فورًا.',
    'app_bug'
  ),
  (
    'الأسئلة الشائعة — التحقق',
    'لإكمال التحقق نحتاج: رقم جوال سعودي موثّق، ورقم هوية وطنية من 10 أرقام، وبريدًا إلكترونيًا مؤكدًا. إن كان أحدها ناقصًا فستظهر لك خطوة التحقق عند تسجيل الدخول. بعد إكمالها يُفعَّل حسابك تلقائيًا دون الحاجة إلى إعادة التسجيل.',
    'account_lock'
  )
on conflict (label) do nothing;

-- Private bucket for screenshots, PDFs and field voice notes. Private because a
-- support attachment routinely contains a customer's personal data; access is
-- via short-lived signed URLs minted server-side, exactly like `inspection-media`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/pdf',
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4'
  ]
)
on conflict (id) do nothing;