-- Lets the login page show the sign-up form until the single account exists.
create function public.registration_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from auth.users)
$$;
revoke execute on function public.registration_open() from public;
grant execute on function public.registration_open() to anon, authenticated;
