alter table public.user_profiles
  alter column phone drop not null;

create or replace function public.upsert_clerk_user(
  p_clerk_user_id text,
  p_phone text,
  p_name text,
  p_is_admin boolean
)
returns setof public.user_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.user_profiles%rowtype;
begin
  if p_clerk_user_id is null or length(p_clerk_user_id) < 1 or length(p_clerk_user_id) > 255
     or (p_phone is not null and p_phone !~ '^5[0-9]{8}$') then
    raise exception 'Invalid Clerk identity or verified Saudi phone number';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fahes:clerk-identity-link', 0));

  select * into profile
    from public.user_profiles
    where clerk_user_id = p_clerk_user_id
    for update;

  if found then
    if p_phone is not null and profile.phone is not null and profile.phone <> p_phone then
      raise exception 'Clerk identity is already linked to another phone number';
    end if;

    update public.user_profiles
      set phone = coalesce(profile.phone, p_phone),
          name = case
            when profile.name = 'عميل' and nullif(btrim(p_name), '') is not null then left(btrim(p_name), 80)
            else profile.name
          end,
          role = case when p_is_admin then 'admin' else profile.role end,
          last_login_at = now()
      where id = profile.id
      returning * into profile;

    return next profile;
    return;
  end if;

  if p_phone is not null then
    select * into profile
      from public.user_profiles
      where phone = p_phone
      for update;

    if found then
      if profile.clerk_user_id is not null and profile.clerk_user_id <> p_clerk_user_id then
        raise exception 'Phone number is already linked to another Clerk identity';
      end if;

      update public.user_profiles
        set clerk_user_id = p_clerk_user_id,
            name = case
              when profile.name = 'عميل' and nullif(btrim(p_name), '') is not null then left(btrim(p_name), 80)
              else profile.name
            end,
            role = case when p_is_admin then 'admin' else profile.role end,
            last_login_at = now()
        where id = profile.id
        returning * into profile;

      return next profile;
      return;
    end if;
  end if;

  insert into public.user_profiles (clerk_user_id, phone, name, role, inspector_status, last_login_at)
  values (
    p_clerk_user_id,
    p_phone,
    case
      when p_is_admin then 'مدير المنصة'
      else coalesce(nullif(left(btrim(p_name), 80), ''), 'عميل')
    end,
    case when p_is_admin then 'admin' else 'customer' end,
    'none',
    now()
  )
  returning * into profile;

  return next profile;
end;
$$;

revoke all on function public.upsert_clerk_user(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.upsert_clerk_user(text, text, text, boolean) to service_role;
