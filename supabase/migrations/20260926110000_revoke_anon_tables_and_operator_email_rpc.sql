-- Anon must not touch public tables even if a policy is missing.
-- Operator email lookup is only for other SECURITY DEFINER functions, not the Data API.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

revoke all on function public.is_platform_operator_email(text) from public, anon, authenticated;
