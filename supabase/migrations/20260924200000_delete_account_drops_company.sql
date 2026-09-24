-- When an auth account is removed, drop customer tenants that person administered.
-- Companies that still have a platform_operator member (본사) stay.

create or replace function public.drop_companies_for_auth_user(p_user uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(p_email));
  v_company uuid;
begin
  for v_company in
    select c.id
    from public.companies c
    where (
        exists (
          select 1 from public.company_memberships m
          where m.company_id = c.id and m.user_id = p_user
        )
        or exists (
          select 1 from public.company_invitations i
          where i.company_id = c.id and lower(i.email) = v_email
        )
        or exists (
          select 1 from public.company_setup_operations s
          where s.company_id = c.id
            and lower(coalesce(s.payload ->> 'admin_email', '')) = v_email
        )
      )
      and not exists (
        select 1
        from public.company_memberships m
        join auth.users u on u.id = m.user_id
        where m.company_id = c.id
          and coalesce((u.raw_app_meta_data ->> 'platform_operator')::boolean, false)
      )
      and not exists (
        select 1 from public.company_memberships m
        where m.company_id = c.id
          and m.role = 'company_admin'
          and m.user_id is distinct from p_user
      )
      and not exists (
        select 1 from public.company_invitations i
        where i.company_id = c.id
          and i.role = 'company_admin'
          and i.accepted_at is null
          and lower(i.email) is distinct from v_email
      )
      and (
        exists (
          select 1 from public.company_memberships m
          where m.company_id = c.id
            and m.user_id = p_user
            and m.role = 'company_admin'
        )
        or exists (
          select 1 from public.company_invitations i
          where i.company_id = c.id
            and lower(i.email) = v_email
            and i.role = 'company_admin'
        )
        or exists (
          select 1 from public.company_setup_operations s
          where s.company_id = c.id
            and lower(coalesce(s.payload ->> 'admin_email', '')) = v_email
        )
        or (
          not exists (
            select 1 from public.company_memberships m
            where m.company_id = c.id and m.user_id is distinct from p_user
          )
          and not exists (
            select 1 from public.company_invitations i
            where i.company_id = c.id and lower(i.email) is distinct from v_email
          )
        )
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

revoke all on function public.drop_companies_for_auth_user(uuid, text) from public, anon, authenticated;

create or replace function public.purge_auth_user_rows(p_user uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.drop_companies_for_auth_user(p_user, p_email);
  update public.asset_qr_labels set created_by = null where created_by = p_user;
  update public.asset_qr_inbox set submitted_by = null where submitted_by = p_user;
  delete from public.company_memberships where user_id = p_user;
  delete from public.company_invitations where lower(email) = lower(p_email);
  delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.purge_auth_user_rows(uuid, text) from public, anon, authenticated;
