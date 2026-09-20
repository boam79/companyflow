-- Limit QR inbox payload size and required fields. Originals stay on the origin PC.

create or replace function public.submit_asset_qr(p_label_id uuid, p_payload jsonb)
returns public.asset_qr_inbox
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.asset_qr_labels;
  inbox public.asset_qr_inbox;
  body jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception '자산 정보가 올바르지 않습니다.';
  end if;

  if octet_length(p_payload::text) > 4000 then
    raise exception '자산 정보가 너무 깁니다.';
  end if;

  if coalesce(btrim(p_payload->>'itemName'), '') = '' or coalesce(btrim(p_payload->>'location'), '') = '' then
    raise exception '품목과 위치를 입력하세요.';
  end if;

  body := jsonb_build_object(
    'itemName', coalesce(p_payload->>'itemName', ''),
    'model', coalesce(p_payload->>'model', ''),
    'serialNo', coalesce(p_payload->>'serialNo', ''),
    'location', coalesce(p_payload->>'location', ''),
    'departmentName', coalesce(p_payload->>'departmentName', ''),
    'ownerName', coalesce(p_payload->>'ownerName', ''),
    'acquiredAt', coalesce(p_payload->>'acquiredAt', '')
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

  if rec.status <> 'blank' then
    raise exception '이미 저장된 QR입니다.';
  end if;

  insert into public.asset_qr_inbox (company_id, label_id, payload, submitted_by)
  values (rec.company_id, rec.id, body, auth.uid())
  returning * into inbox;

  update public.asset_qr_labels
  set status = 'submitted'
  where id = rec.id;

  return inbox;
end;
$$;

revoke all on function public.submit_asset_qr(uuid, jsonb) from public, anon;
grant execute on function public.submit_asset_qr(uuid, jsonb) to authenticated;
