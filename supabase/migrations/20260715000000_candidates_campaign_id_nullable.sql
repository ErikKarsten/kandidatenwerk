-- Kandidaten sollen künftig auch ohne feste Kampagnenzuordnung existieren können (Pool-Modell für automatisches Matching)
ALTER TABLE candidates ALTER COLUMN campaign_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
