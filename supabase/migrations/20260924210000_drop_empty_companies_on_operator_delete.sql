-- Operator account delete also removes customer tenants that have no people left.

create or replace function public.drop_empty_customer_companies()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_company uuid;
begin
  for v_company in
    select c.id
    from public.companies c
    where not exists (
      select 1 from public.company_memberships m where m.company_id = c.id
    )
    and not exists (
      select 1 from public.company_invitations i where i.company_id = c.id
    )
  loop
    delete from public.asset_qr_inbox where company_id = v_company;
    delete from public.asset_qr_labels where company_id = v_company;
    delete from public.company_devices where company_id = v_company;
    delete from public.company_setup_operations where company_id = v_company;
    delete from public.company_entitlements where company_id = v_company;
    delete from public.company_invitations where company_id = v_company;
    delete from public.company_memberships where company_id = v_company;
    delete from public.companies where id = v_company;
  end loop;
end;
$$;

revoke all on function public.drop_empty_customer_companies() from public, anon, authenticated;

create or replace function public.operator_delete_auth_user(p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user uuid;
  v_operator boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if not public.is_platform_operator() then
    raise exception '운영 관리자만 다른 계정을 지울 수 있습니다.';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception '이메일 형식이 아닙니다.';
  end if;
  select
    u.id,
    coalesce((u.raw_app_meta_data ->> 'platform_operator')::boolean, false)
  into v_user, v_operator
  from auth.users u
  where lower(u.email) = v_email
    and u.deleted_at is null
  limit 1;
  if v_user is null then
    raise exception '그 이메일 계정이 없습니다.';
  end if;
  if v_operator or v_user = auth.uid() then
    raise exception '운영 계정은 삭제하지 않습니다.';
  end if;
  perform public.purge_auth_user_rows(v_user, v_email);
  perform public.drop_empty_customer_companies();
end;
$$;

revoke all on function public.operator_delete_auth_user(text) from public, anon;
grant execute on function public.operator_delete_auth_user(text) to authenticated;
