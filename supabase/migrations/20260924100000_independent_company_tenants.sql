-- Independent tenants: the operator registers companies but does not auto-join them.
-- Membership rows are only the caller's own. Member lists require belonging.

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

drop policy if exists memberships_select_own on public.company_memberships;
create policy memberships_select_own on public.company_memberships
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists entitlements_select_member on public.company_entitlements;
create policy entitlements_select_member on public.company_entitlements
  for select to authenticated
  using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_entitlements.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

drop policy if exists devices_select_member on public.company_devices;
create policy devices_select_member on public.company_devices
  for select to authenticated
  using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_devices.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create or replace function public.list_company_members(p_company_id uuid)
returns table (email text, role text, status text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if not exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    raise exception '이 회사에 연결된 계정만 볼 수 있습니다.';
  end if;

  return query
  select u.email::text, m.role, m.status
  from public.company_memberships m
  join auth.users u on u.id = m.user_id
  where m.company_id = p_company_id
    and m.status = 'active'
  order by case when m.role = 'company_admin' then 0 else 1 end, u.email;
end;
$$;

revoke all on function public.list_company_members(uuid) from public, anon;
grant execute on function public.list_company_members(uuid) to authenticated;
