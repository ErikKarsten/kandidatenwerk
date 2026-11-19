-- Paket 113 (19.11.2026): "Setting BDA" in Close automatisch aus dem Quali-Gespräch füllen.
-- Ein Auftrag pro Statuswechsel "Quali terminiert …" → "SC Terminiert …" (Close-Webhook);
-- der Cronjob setting-bda arbeitet sie ab (src/lib/setting-bda.ts).
--
-- status: offen (wartet/neuer Versuch), erledigt (Aktivität in Close angelegt),
--   vorhanden (schon von Hand ausgefüllt), keine_quelle (keine Aufnahme/Mitschrift),
--   fehler (nach mehreren Versuchen aufgegeben).
-- Nur der Server (Service-Rolle) liest und schreibt; RLS an, keine Policies.

create table if not exists public.setting_bda_auftraege (
  status_change_id text primary key,
  lead_id text not null,
  alt_status text,
  neu_status text,
  wechsel_am timestamptz not null,
  status text not null default 'offen' check (status in ('offen', 'erledigt', 'vorhanden', 'keine_quelle', 'fehler')),
  versuche integer not null default 0,
  fehler text,
  close_activity_id text,
  telefonat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists setting_bda_auftraege_offen_idx on public.setting_bda_auftraege (status, wechsel_am);
alter table public.setting_bda_auftraege enable row level security;

NOTIFY pgrst, 'reload schema';
