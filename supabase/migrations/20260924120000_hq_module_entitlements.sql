-- HQ operator may read and set each company's allowed modules without joining that company.

drop policy if exists entitlements_select_member on public.company_entitlements;
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

drop policy if exists entitlements_update_operator on public.company_entitlements;
create policy entitlements_update_operator on public.company_entitlements
  for update to authenticated
  using (public.is_platform_operator())
  with check (public.is_platform_operator());
