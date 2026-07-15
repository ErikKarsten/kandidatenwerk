GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_campaign_matches TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
