GRANT SELECT ON public.agencies TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
