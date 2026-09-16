-- If the invited admin already has an Auth user, attach them as company_admin.

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

  if v_user is not null then
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
