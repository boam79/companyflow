-- Recycle Auth emails: memberships and invites go with the user. Operator accounts stay.

create or replace function public.purge_auth_user_rows(p_user uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.asset_qr_labels set created_by = null where created_by = p_user;
  update public.asset_qr_inbox set submitted_by = null where submitted_by = p_user;
  delete from public.company_memberships where user_id = p_user;
  delete from public.company_invitations where lower(email) = lower(p_email);
  delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.purge_auth_user_rows(uuid, text) from public, anon, authenticated;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if public.is_platform_operator() then
    raise exception '운영 계정은 삭제하지 않습니다. 테스트 이메일은 회사 관리에서 지웁니다.';
  end if;
  select email into v_email from auth.users where id = v_user;
  if v_email is null then
    raise exception '계정을 찾지 못했습니다.';
  end if;
  perform public.purge_auth_user_rows(v_user, v_email);
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

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
end;
$$;

revoke all on function public.operator_delete_auth_user(text) from public, anon;
grant execute on function public.operator_delete_auth_user(text) to authenticated;
