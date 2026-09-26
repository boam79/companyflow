-- Operator JWT must not open another company's QR inbox, origin device, or relay key.
-- Blank QR mint and inbox ACK stay on the company admin origin PC.

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role = 'company_admin'
      and m.status = 'active'
  );
$$;

revoke all on function public.is_company_admin(uuid) from public, anon;
grant execute on function public.is_company_admin(uuid) to authenticated;

create or replace function public.is_active_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

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
  if p_jwk is null or length(btrim(p_jwk)) < 20 or p_jwk not like '{%}' then
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

create or replace function public.import_asset_qr(p_label_id uuid)
returns public.asset_qr_inbox
language plpgsql
security definer
set search_path = public
as $$
declare
  inbox public.asset_qr_inbox;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into inbox
  from public.asset_qr_inbox
  where label_id = p_label_id
  for update;

  if not found then
    raise exception '스마트폰에서 저장한 자산 정보가 없습니다.';
  end if;

  if not public.is_company_admin(inbox.company_id) then
    raise exception '지정 PC 회사 관리자만 원본에 반영합니다.';
  end if;

  update public.asset_qr_inbox
  set imported_at = coalesce(imported_at, now()),
      payload = '{}'::jsonb,
      ciphertext = null
  where label_id = p_label_id
  returning * into inbox;

  update public.asset_qr_labels
  set status = 'imported'
  where id = p_label_id;

  return inbox;
end;
$$;

drop policy if exists asset_qr_labels_insert on public.asset_qr_labels;
create policy asset_qr_labels_insert
  on public.asset_qr_labels
  for insert
  to authenticated
  with check (public.is_company_admin(company_id) and status = 'blank');
