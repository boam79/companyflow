-- Least privilege for signed-in users on exposed tables.
-- RLS already denies writes without a policy, but TRUNCATE, TRIGGER and REFERENCES
-- are not covered by RLS, and every future table inherited the broad default grants.
-- All business writes go through SECURITY DEFINER RPCs (owned by postgres), which are unaffected.

revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

-- Blank QR labels are inserted by company admins (RLS: is_company_admin and status = 'blank').
grant insert on public.asset_qr_labels to authenticated;

-- Platform operator toggles modules only (RLS: is_platform_operator()).
grant update (allowed_modules) on public.company_entitlements to authenticated;

-- New tables and functions must opt in explicitly.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
