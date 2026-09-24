-- Invited first-admin / member emails are already typed by the operator.
-- Built-in Supabase mail (noreply@mail.app.supabase.io) often never reaches Naver,
-- so invited signups confirm immediately and can log in without the mail.

create or replace function public.confirm_invited_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email is not null
     and new.email_confirmed_at is null
     and exists (
       select 1
       from public.company_invitations i
       where i.email = lower(new.email)
         and i.accepted_at is null
         and i.expires_at > now()
     )
  then
    new.email_confirmed_at := now();
    new.confirmation_token := '';
  end if;
  return new;
end;
$$;

drop trigger if exists confirm_invited_auth_user on auth.users;
create trigger confirm_invited_auth_user
  before insert on auth.users
  for each row
  execute function public.confirm_invited_auth_user();

revoke all on function public.confirm_invited_auth_user() from public, anon, authenticated;
