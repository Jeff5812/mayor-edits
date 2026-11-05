-- Anonymous visitors never need this: admin policies apply to signed-in users only.
revoke execute on function public.is_admin() from anon;
