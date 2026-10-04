-- Bound device fingerprint and relay JWK size so authenticated callers cannot store unbounded text.

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
begin
  if p_device_fingerprint is null or p_device_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception '원본 장치 표식이 올바르지 않습니다.';
  end if;
  if not public.is_company_admin(p_company_id) then
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
begin
  if p_device_fingerprint is null or p_device_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception '원본 장치 표식이 올바르지 않습니다.';
  end if;
  if not public.is_company_admin(p_company_id) then
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

create or replace function public.publish_relay_public_key(p_company_id uuid, p_jwk text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_jwk is null or length(btrim(p_jwk)) < 20 or length(p_jwk) > 4096 or p_jwk not like '{%}' then
    raise exception '수신 키가 올바르지 않습니다.';
  end if;
  if not public.is_company_admin(p_company_id) then
    raise exception '수신 키는 회사 관리자만 등록합니다.';
  end if;
  update public.companies
  set relay_public_jwk = p_jwk
  where id = p_company_id;
end;
$$;

revoke all on function public.claim_company_device(uuid, text) from public, anon;
revoke all on function public.confirm_company_device(uuid, text) from public, anon;
revoke all on function public.publish_relay_public_key(uuid, text) from public, anon;
grant execute on function public.claim_company_device(uuid, text) to authenticated;
grant execute on function public.confirm_company_device(uuid, text) to authenticated;
grant execute on function public.publish_relay_public_key(uuid, text) to authenticated;
