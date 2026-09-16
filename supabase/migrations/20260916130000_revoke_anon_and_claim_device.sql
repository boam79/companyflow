-- Anon must not call SECURITY DEFINER RPCs. Device claim keeps a confirmed fingerprint.

revoke execute on function public.create_company(text, text, uuid, text) from public, anon;
grant execute on function public.create_company(text, text, uuid, text) to authenticated;

create or replace function public.is_platform_operator()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'platform_operator')::boolean, false);
$$;

revoke all on function public.is_platform_operator() from public, anon;
grant execute on function public.is_platform_operator() to authenticated;

create or replace function public.claim_company_device(
  p_company_id uuid,
  p_device_fingerprint text
)
returns public.company_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.company_devices;
  is_admin boolean;
begin
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role = 'company_admin'
      and m.status = 'active'
  ) into is_admin;

  if not (is_admin or public.is_platform_operator()) then
    raise exception '이 회사의 원본 장치를 설정할 권한이 없습니다.';
  end if;

  insert into public.company_devices (company_id, device_fingerprint, status, reserved_at)
  values (p_company_id, p_device_fingerprint, 'reserved', now())
  on conflict (company_id)
  do update set
    device_fingerprint = case
      when public.company_devices.status = 'confirmed'
        then public.company_devices.device_fingerprint
      else excluded.device_fingerprint
    end,
    status = case
      when public.company_devices.status = 'confirmed' then public.company_devices.status
      else 'reserved'
    end,
    reserved_at = coalesce(public.company_devices.reserved_at, now())
  returning * into rec;

  if rec.status = 'confirmed' and rec.device_fingerprint is distinct from p_device_fingerprint then
    raise exception '이미 다른 원본 장치가 등록되어 있습니다. 백업 복원으로 안내합니다.';
  end if;

  return rec;
end;
$$;

revoke all on function public.claim_company_device(uuid, text) from public, anon;
grant execute on function public.claim_company_device(uuid, text) to authenticated;
