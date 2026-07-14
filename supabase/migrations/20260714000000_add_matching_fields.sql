-- Felder für automatisches Matching zwischen Kandidaten und Kampagnen (Beruf + Standort)

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS berufsbild text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS plz text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS lng numeric;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS radius_km integer DEFAULT 25;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS berufsbild text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS plz text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS lng numeric;

ALTER TABLE campaigns ADD CONSTRAINT campaigns_berufsbild_check
  CHECK (berufsbild IN ('steuerfachangestellte', 'bilanzbuchhalter', 'steuerfachwirt', 'steuerberater', 'sonstige'));

ALTER TABLE candidates ADD CONSTRAINT candidates_berufsbild_check
  CHECK (berufsbild IN ('steuerfachangestellte', 'bilanzbuchhalter', 'steuerfachwirt', 'steuerberater', 'sonstige'));

NOTIFY pgrst, 'reload schema';
