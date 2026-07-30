-- Grundlage für den Sync zwischen Kandidatenwerk und Leadtable.
-- text statt uuid, da Leadtable MongoDB ObjectIds nutzt (24-stellige Hex-Strings),
-- keine UUIDs. UNIQUE stellt sicher, dass nie zwei Kandidatenwerk-Datensätze auf
-- denselben Leadtable-Datensatz zeigen (verhindert Duplikate beim Sync).

alter table public.clients
  add column leadtable_customer_id text unique;

alter table public.campaigns
  add column leadtable_campaign_id text unique;
