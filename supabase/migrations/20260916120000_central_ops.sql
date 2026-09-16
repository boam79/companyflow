-- CompanyFlow central ops. Apply on a dedicated project only.
-- Authorization uses auth.jwt() -> app_metadata, never user_metadata.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  company_code text not null unique,
  registration_status text not null default 'pending_admin',
  create_operation_id uuid not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('company_admin', 'member')),
  status text not null default 'pending',
  unique (company_id, user_id)
);

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  email text not null,
  role text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create table if not exists public.company_entitlements (
  company_id uuid primary key references public.companies(id),
  allowed_modules jsonb not null default '[]'::jsonb,
  license_status text not null default 'active'
);

create table if not exists public.company_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) unique,
  device_fingerprint text,
  status text not null default 'reserved',
  reserved_at timestamptz,
  confirmed_at timestamptz
);

create table if not exists public.company_setup_operations (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  step text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.company_invitations enable row level security;
alter table public.company_entitlements enable row level security;
alter table public.company_devices enable row level security;
alter table public.company_setup_operations enable row level security;

create or replace function public.is_platform_operator()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'platform_operator')::boolean, false);
$$;

create or replace function public.create_company(
  p_display_name text,
  p_company_code text,
  p_operation_id uuid,
  p_admin_email text
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.companies;
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
    jsonb_build_object('admin_email', p_admin_email)
  )
  on conflict (id) do nothing;

  return rec;
end;
$$;

revoke all on function public.create_company(text, text, uuid, text) from public;
grant execute on function public.create_company(text, text, uuid, text) to authenticated;

create policy companies_select_member on public.companies
  for select to authenticated
  using (
    public.is_platform_operator()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = companies.id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy memberships_select_own on public.company_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_operator());

create policy invitations_select_operator on public.company_invitations
  for select to authenticated
  using (public.is_platform_operator());

create policy entitlements_select_member on public.company_entitlements
  for select to authenticated
  using (
    public.is_platform_operator()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = company_entitlements.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy devices_select_member on public.company_devices
  for select to authenticated
  using (
    public.is_platform_operator()
    or exists (
      select 1 from public.company_memberships m
      where m.company_id = company_devices.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

create policy setup_ops_select_operator on public.company_setup_operations
  for select to authenticated
  using (public.is_platform_operator());
