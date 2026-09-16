-- Confirm the reserved original device after local OPFS is ready.

create or replace function public.confirm_company_device(
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
    raise exception '이 회사의 원본 장치를 확정할 권한이 없습니다.';
  end if;

  select * into rec
  from public.company_devices
  where company_id = p_company_id;

  if not found then
    raise exception '예약된 원본 장치가 없습니다. 먼저 지정 PC 초기 설정을 진행하세요.';
  end if;

  if rec.status = 'confirmed' and rec.device_fingerprint is distinct from p_device_fingerprint then
    raise exception '이미 다른 원본 장치가 등록되어 있습니다. 백업 복원으로 안내합니다.';
  end if;

  update public.company_devices
  set
    device_fingerprint = p_device_fingerprint,
    status = 'confirmed',
    confirmed_at = coalesce(confirmed_at, now())
  where company_id = p_company_id
  returning * into rec;

  update public.companies
  set registration_status = 'ready'
  where id = p_company_id
    and registration_status in ('pending_admin', 'admin_linked');

  return rec;
end;
$$;

revoke all on function public.confirm_company_device(uuid, text) from public, anon;
grant execute on function public.confirm_company_device(uuid, text) to authenticated;
