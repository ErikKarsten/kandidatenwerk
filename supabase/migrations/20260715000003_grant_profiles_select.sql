GRANT SELECT ON public.profiles TO authenticated;
NOTIFY pgrst, 'reload schema';
