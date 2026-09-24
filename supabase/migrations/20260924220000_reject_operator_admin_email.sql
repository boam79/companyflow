-- Customer companies must not use the platform operator email as first admin or invite.

create or replace function public.is_platform_operator_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and u.deleted_at is null
      and coalesce((u.raw_app_meta_data ->> 'platform_operator')::boolean, false)
  );
$$;

revoke all on function public.is_platform_operator_email(text) from public, anon;
grant execute on function public.is_platform_operator_email(text) to authenticated;

create or replace function public.create_company(
  p_display_name text,
  p_company_code text,
  p_operation_id uuid,
  p_admin_email text
)
returns public.companies
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  rec public.companies;
  v_user uuid;
begin
  if not public.is_platform_operator() then
    raise exception '운영 관리자만 회사를 생성할 수 있습니다.';
  end if;
  if public.is_platform_operator_email(p_admin_email) then
    raise exception '팔 회사에는 고객 이메일을 적습니다. 운영 계정은 넣지 않습니다.';
  end if;

  insert into public.companies (display_name, company_code, create_operation_id)
  values (p_display_name, p_company_code, p_operation_id)
  on conflict (create_operation_id)
  do update set display_name = public.companies.display_name
  returning * into rec;

  insert into public.company_entitlements (company_id)
  values (rec.id)
  on conflict do nothing;

  insert into public.company_setup_operations (id, company_id, step, payload)
  values (
    p_operation_id,
    rec.id,
    'registered',
    jsonb_build_object('admin_email', lower(p_admin_email))
  )
  on conflict (id) do nothing;

  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(p_admin_email)
    and u.deleted_at is null
  limit 1;

  if v_user is not null and v_user is distinct from auth.uid() then
    insert into public.company_memberships (company_id, user_id, role, status)
    values (rec.id, v_user, 'company_admin', 'active')
    on conflict (company_id, user_id) do update
      set role = excluded.role, status = excluded.status;
    update public.companies
    set registration_status = 'admin_linked'
    where id = rec.id
    returning * into rec;
  else
    insert into public.company_invitations (company_id, email, role, token_hash, expires_at)
    values (
      rec.id,
      lower(p_admin_email),
      'company_admin',
      encode(gen_random_bytes(16), 'hex'),
      now() + interval '14 days'
    );
  end if;

  return rec;
end;
$$;

revoke all on function public.create_company(text, text, uuid, text) from public, anon;
grant execute on function public.create_company(text, text, uuid, text) to authenticated;

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
  if public.is_platform_operator_email(v_email) then
    raise exception '팔 회사에는 고객 이메일을 적습니다. 운영 계정은 넣지 않습니다.';
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

revoke all on function public.invite_company_user(uuid, text, text) from public, anon;
grant execute on function public.invite_company_user(uuid, text, text) to authenticated;
