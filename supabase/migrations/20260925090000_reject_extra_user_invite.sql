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
begin
  if auth.uid() is null then
    raise exception '초대할 수 없습니다. 로그인이 필요합니다.';
  end if;
  raise exception '추가 사람은 붙이지 않습니다.';
end;
$$;

revoke all on function public.invite_company_user(uuid, text, text) from public, anon;
grant execute on function public.invite_company_user(uuid, text, text) to authenticated;
