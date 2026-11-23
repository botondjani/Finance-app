-- Trigger functions must not be callable through the REST API.
revoke execute on function public.enforce_single_user() from public, anon, authenticated;
revoke execute on function public.seed_user_defaults() from public, anon, authenticated;
