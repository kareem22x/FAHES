-- ============================================================================
-- 07 — قفل جهاز الفاحص + سجل تدقيق غير قابل للتعديل
-- ----------------------------------------------------------------------------
-- هذا هو الترحيل 20261001120000 الأصلي، منقوشًا ليكون idempotent (%I + if not
-- exists) ومُوطَّنًا (كل جدول/دالة في مكانه). أُضيف استثناء المالك لدالة الربط
-- حتى يستطيع مالك المنصة فتح لوحة الفاحصين من حاسوبه.
--
-- ⚠️ IMPORTANT: هذا الملف مستقل عن 11 (owner_inspector_dashboard). لو شغّلت
--    الاثنين معًا فآخر ملف يُنفَّذ هو الذي يفوز بتعريف الدالة. الحل النهائي في
--    الملف 11 الذي يعيد تعريف الدالة بنفس النسخة المالك-مستثناة. الترتيب
--    الزمني يضمن أن 11 هو الأخير.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. جدول أجهزة الفاحصين
-- ----------------------------------------------------------------------------

create table if not exists public.inspector_devices (
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

-- ربط واحد نشط لكل فاحص؛ ويجوز إعادة تسجيل الجهاز نفسه بعد فكّ الارتباط.
create unique index if not exists inspector_devices_active_binding_idx
  on public.inspector_devices(inspector_id)
  where revoked_at is null;

create index if not exists inspector_devices_lookup_idx
  on public.inspector_devices(inspector_id, device_hash)
  where revoked_at is null;

alter table public.inspector_devices enable row level security;
alter table public.inspector_devices force row level security;
revoke all on public.inspector_devices from public, anon, authenticated;
grant all on public.inspector_devices to service_role;

comment on table public.inspector_devices is
  'الهواتف المرتبطة بفاحص معتمد. صف نشط واحد لكل فاحص (فهرس فريد جزئي). لا يقرأه أو يكتبه إلا service_role.';

-- ---------------------------------------------------------------------------
-- 2. ربط / التحقق من جهاز الفاحص (معاملة واحدة، آمن ضد التزامن)
-- ----------------------------------------------------------------------------

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
  is_owner boolean;
begin
  -- دفاع في العمق: الـAPI يتحقق أيضًا، لكن قاعدة البيانات هي الخط الأخير
  -- ولا يجوز أن تخزّن بصمة غير مُتحقَّق من صيغتها.
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into profile
    from public.user_profiles
    where id = p_inspector_id;

  if not found then
    return jsonb_build_object('status', 'not_inspector');
  end if;

  -- مالك المنصة يُقرأ من نفس الجدول، بلا أي مصدر خارجي.
  is_owner := profile.role = 'admin';

  if not (
       (profile.role = 'inspector' and profile.inspector_status = 'approved')
       or is_owner
     ) then
    return jsonb_build_object('status', 'not_inspector');
  end if;

  -- هاتفان يتسابقان على حساب الفاحص نفسه لا يجوز أن يفوزا معًا.
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

  -- أي جهاز نشط آخر يعني أن الحساب مقفل على جهاز غيره — إلا للمالك.
  select * into bound
    from public.inspector_devices
    where inspector_id = p_inspector_id
      and revoked_at is null
    order by first_seen_at
    limit 1;

  if found and not is_owner then
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
-- 3. فكّ ارتباط الجهاز (إداري فقط، مُدقَّق)
-- ----------------------------------------------------------------------------

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
-- 4. جعل سجل التدقيق غير قابل للتعديل فعلًا (لا مجرد عُرف)
-- ----------------------------------------------------------------------------

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
