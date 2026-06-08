ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS meta_field_mapping jsonb DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS meta_form_id text;
