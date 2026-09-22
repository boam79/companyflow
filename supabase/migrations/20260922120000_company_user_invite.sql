-- Company admin or operator invites an email. Membership stays off until accept.

create unique index if not exists company_invitations_open_email
  on public.company_invitations (company_id, email)
  where accepted_at is null;

create or replace function public.invite_company_user(
  p_company_id uuid,
  p_email text,
  p_role text
)
returns table (id uuid, email text, role text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(p_email));
  v_existing public.company_invitations;
begin
  if auth.uid() is null then
    raise exception '초대할 수 없습니다. 로그인이 필요합니다.';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception '이메일 형식이 아닙니다.';
  end if;
  if p_role not in ('company_admin', 'member') then
    raise exception '허용되지 않은 역할입니다.';
  end if;
  if not (
    public.is_platform_operator()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.role = 'company_admin'
        and m.status = 'active'
    )
  ) then
    raise exception '이 회사의 관리자만 사용자를 초대할 수 있습니다.';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception '회사를 찾지 못했습니다.';
  end if;
  if exists (
    select 1
    from public.company_memberships m
    join auth.users u on u.id = m.user_id
    where m.company_id = p_company_id
      and m.status = 'active'
      and lower(u.email) = v_email
      and u.deleted_at is null
  ) then
    raise exception '이미 이 회사의 사용자입니다.';
  end if;

  select * into v_existing
  from public.company_invitations i
  where i.company_id = p_company_id
    and i.email = v_email
    and i.accepted_at is null
    and i.expires_at > now()
  limit 1;

  if not found then
    insert into public.company_invitations (company_id, email, role, token_hash, expires_at)
    values (
      p_company_id,
      v_email,
      p_role,
      encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex'),
      now() + interval '14 days'
    )
    returning * into v_existing;
  end if;

  return query
  select v_existing.id, v_existing.email, v_existing.role, v_existing.expires_at;
end;
$$;

create or replace function public.list_company_invitations(p_company_id uuid)
returns table (id uuid, email text, role text, expires_at timestamptz, accepted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if not (
    public.is_platform_operator()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.role = 'company_admin'
        and m.status = 'active'
    )
  ) then
    raise exception '이 회사의 관리자만 초대를 볼 수 있습니다.';
  end if;

  return query
  select i.id, i.email, i.role, i.expires_at, i.accepted_at
  from public.company_invitations i
  where i.company_id = p_company_id
  order by i.expires_at desc;
end;
$$;

create or replace function public.list_my_company_invitations()
returns table (id uuid, company_id uuid, display_name text, role text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' then
    return;
  end if;

  return query
  select i.id, i.company_id, c.display_name, i.role, i.expires_at
  from public.company_invitations i
  join public.companies c on c.id = i.company_id
  where i.email = v_email
    and i.accepted_at is null
    and i.expires_at > now();
end;
$$;

create or replace function public.accept_company_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite public.company_invitations;
begin
  if auth.uid() is null or v_email = '' then
    raise exception '로그인한 계정만 초대를 수락할 수 있습니다.';
  end if;

  select * into v_invite
  from public.company_invitations i
  where i.id = p_invitation_id;

  if v_invite.id is null then
    raise exception '초대를 찾지 못했습니다.';
  end if;
  if v_invite.email <> v_email then
    raise exception '이 초대의 이메일이 아닙니다.';
  end if;
  if v_invite.role not in ('company_admin', 'member') then
    raise exception '허용되지 않은 역할입니다.';
  end if;
  if v_invite.accepted_at is not null then
    return v_invite.company_id;
  end if;
  if v_invite.expires_at <= now() then
    raise exception '초대 기한이 지났습니다.';
  end if;

  insert into public.company_memberships (company_id, user_id, role, status)
  values (v_invite.company_id, auth.uid(), v_invite.role, 'active')
  on conflict (company_id, user_id) do update
    set role = excluded.role, status = 'active';

  update public.company_invitations
  set accepted_at = now()
  where id = v_invite.id
    and accepted_at is null;

  return v_invite.company_id;
end;
$$;

revoke all on function public.invite_company_user(uuid, text, text) from public, anon;
revoke all on function public.list_company_invitations(uuid) from public, anon;
revoke all on function public.list_my_company_invitations() from public, anon;
revoke all on function public.accept_company_invitation(uuid) from public, anon;
grant execute on function public.invite_company_user(uuid, text, text) to authenticated;
grant execute on function public.list_company_invitations(uuid) to authenticated;
grant execute on function public.list_my_company_invitations() to authenticated;
grant execute on function public.accept_company_invitation(uuid) to authenticated;
