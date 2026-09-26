-- Encrypted Relay envelope + company public key. Plaintext QR payloads are rejected.

alter table public.companies
  add column if not exists relay_public_jwk text;

alter table public.asset_qr_inbox
  add column if not exists ciphertext jsonb;

alter table public.asset_qr_inbox
  add column if not exists expires_at timestamptz;

alter table public.asset_qr_inbox
  add column if not exists message_id uuid;

update public.asset_qr_inbox
  set expires_at = submitted_at + interval '72 hours'
  where expires_at is null;

create unique index if not exists asset_qr_inbox_message_id
  on public.asset_qr_inbox (message_id)
  where message_id is not null;

create or replace function public.publish_relay_public_key(p_company_id uuid, p_jwk text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_jwk is null or length(btrim(p_jwk)) < 20 or p_jwk not like '{%}' then
    raise exception '수신 키가 올바르지 않습니다.';
  end if;
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role = 'company_admin'
      and m.status = 'active'
  ) into is_admin;
  if not (is_admin or public.is_platform_operator()) then
    raise exception '수신 키는 회사 관리자만 등록합니다.';
  end if;
  update public.companies
  set relay_public_jwk = p_jwk
  where id = p_company_id;
end;
$$;

revoke all on function public.publish_relay_public_key(uuid, text) from public, anon;
grant execute on function public.publish_relay_public_key(uuid, text) to authenticated;

create or replace function public.submit_asset_qr(p_label_id uuid, p_payload jsonb)
returns public.asset_qr_inbox
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.asset_qr_labels;
  inbox public.asset_qr_inbox;
  envelope jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception '암호문 형식이 아닙니다.';
  end if;

  if p_payload ? 'itemName' or p_payload ? 'location' or p_payload ? 'ownerName' then
    raise exception '업무 내용은 암호문으로만 받습니다.';
  end if;

  if coalesce(p_payload->>'v', '') <> '1'
     or coalesce(p_payload->>'alg', '') <> 'ECDH-ES+A256GCM'
     or coalesce(p_payload->>'iv', '') = ''
     or coalesce(p_payload->>'ct', '') = ''
     or jsonb_typeof(p_payload->'epk') <> 'object' then
    raise exception '암호문 형식이 아닙니다.';
  end if;

  if octet_length(p_payload::text) > 8000 then
    raise exception '암호문이 너무 깁니다.';
  end if;

  envelope := jsonb_build_object(
    'v', 1,
    'alg', p_payload->>'alg',
    'epk', p_payload->'epk',
    'iv', p_payload->>'iv',
    'ct', p_payload->>'ct'
  );

  select * into rec
  from public.asset_qr_labels
  where id = p_label_id
  for update;

  if not found then
    raise exception '이 QR은 등록된 빈 QR이 아닙니다.';
  end if;

  if not public.is_active_company_member(rec.company_id) then
    raise exception '이 회사 자산 QR을 저장할 권한이 없습니다.';
  end if;

  if rec.status = 'imported' then
    raise exception '이미 저장된 QR입니다.';
  end if;

  if rec.status = 'submitted' then
    select * into inbox
    from public.asset_qr_inbox
    where label_id = rec.id
    for update;
    if found and inbox.expires_at is not null and inbox.expires_at > now() then
      raise exception '이미 저장된 QR입니다.';
    end if;
    delete from public.asset_qr_inbox where label_id = rec.id;
  end if;

  insert into public.asset_qr_inbox (
    company_id, label_id, payload, ciphertext, submitted_by, expires_at, message_id
  )
  values (
    rec.company_id,
    rec.id,
    '{}'::jsonb,
    envelope,
    auth.uid(),
    now() + interval '72 hours',
    gen_random_uuid()
  )
  returning * into inbox;

  update public.asset_qr_labels
  set status = 'submitted'
  where id = rec.id;

  return inbox;
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

  if not public.is_active_company_member(inbox.company_id) then
    raise exception '이 회사 자산을 원본에 반영할 권한이 없습니다.';
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

revoke all on function public.submit_asset_qr(uuid, jsonb) from public, anon;
revoke all on function public.import_asset_qr(uuid) from public, anon;
grant execute on function public.submit_asset_qr(uuid, jsonb) to authenticated;
grant execute on function public.import_asset_qr(uuid) to authenticated;
