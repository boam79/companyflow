-- Operator (최고 관리자) may open any registered company to work people/stock/assets/contracts.

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
  if not (
    public.is_platform_operator()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
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

drop policy if exists devices_select_member on public.company_devices;
create policy devices_select_member on public.company_devices
  for select to authenticated
  using (
    public.is_platform_operator()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = company_devices.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );
