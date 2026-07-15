-- Backfill: 3 Clients ohne agency_id der einzigen bestehenden Agentur zuordnen
-- (Endlich Mitarbeiter, 00000000-0000-0000-0000-000000000001)
UPDATE public.clients
SET agency_id = '00000000-0000-0000-0000-000000000001'
WHERE id IN (
  '07ac9ea8-26d7-481f-bd07-bbe3b1c3176b',
  'dc3347dd-b632-4ae1-b52d-4631b629b5b1',
  '62e34ac4-2831-48d3-8516-a74b09f1651e'
)
AND agency_id IS NULL;

NOTIFY pgrst, 'reload schema';
