ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
