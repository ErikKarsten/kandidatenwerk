ALTER TABLE public.candidates DROP CONSTRAINT candidates_source_check;

ALTER TABLE public.candidates ADD CONSTRAINT candidates_source_check
  CHECK ((source = ANY (ARRAY['meta_ads'::text, 'kanzleistelle24'::text, 'manual'::text, 'leadtable'::text])));
