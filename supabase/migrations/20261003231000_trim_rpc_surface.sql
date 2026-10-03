-- Shrink the RPC surface that signed-in users can call.
-- invite_company_user only raises ("추가 사람은 붙이지 않습니다") and list_company_invitations is unused by the app.
revoke all on function public.invite_company_user(uuid, text, text) from public, anon, authenticated;
revoke all on function public.list_company_invitations(uuid) from public, anon, authenticated;

-- The membership helpers only look at the caller's own row, which memberships_select_own already allows.
-- Running them as the caller removes two SECURITY DEFINER entry points without changing results.
alter function public.is_active_company_member(uuid) security invoker;
alter function public.is_company_admin(uuid) security invoker;
