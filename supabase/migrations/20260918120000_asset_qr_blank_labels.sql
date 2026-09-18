-- Blank asset QR labels and phone submissions. Asset originals stay on the origin PC.
-- Inbox payload is temporary Relay until imported, then cleared (AC-20).

create table if not exists public.asset_qr_labels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  status text not null default 'blank' check (status in ('blank', 'submitted', 'imported')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.asset_qr_inbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  label_id uuid not null references public.asset_qr_labels(id),
  payload jsonb not null default '{}'::jsonb,
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  imported_at timestamptz,
  unique (label_id)
);

alter table public.asset_qr_labels enable row level security;
alter table public.asset_qr_inbox enable row level security;

create or replace function public.is_active_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_operator()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = p_company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    );
$$;

revoke all on function public.is_active_company_member(uuid) from public, anon;
grant execute on function public.is_active_company_member(uuid) to authenticated;

create policy asset_qr_labels_select on public.asset_qr_labels
  for select to authenticated
  using (public.is_active_company_member(company_id));

create policy asset_qr_labels_insert on public.asset_qr_labels
  for insert to authenticated
  with check (
    public.is_active_company_member(company_id)
    and status = 'blank'
  );

create policy asset_qr_inbox_select on public.asset_qr_inbox
  for select to authenticated
  using (public.is_active_company_member(company_id));

create or replace function public.submit_asset_qr(p_label_id uuid, p_payload jsonb)
returns public.asset_qr_inbox
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.asset_qr_labels;
  inbox public.asset_qr_inbox;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

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
  values (rec.company_id, rec.id, coalesce(p_payload, '{}'::jsonb), auth.uid())
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
      payload = '{}'::jsonb
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

grant select, insert on public.asset_qr_labels to authenticated;
grant select on public.asset_qr_inbox to authenticated;
