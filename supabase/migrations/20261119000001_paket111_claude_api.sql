-- Paket 111 (19.11.2026): Kandidatenwerk aus Claude Code steuern (MCP-Server unter /api/mcp).
--
-- api_schluessel: persönliche Schlüssel der Agentur-Admins. Gespeichert wird nur der
--   SHA-256-Hash, der Schlüssel selbst wird einmal beim Anlegen angezeigt. Ein Schlüssel
--   handelt im Namen seiner Person; wer kein Admin mehr ist, kommt damit nicht mehr rein.
-- api_protokoll: jeder Werkzeug-Aufruf (wer, welches Werkzeug, Argumente gekürzt, Ergebnis).
--   Bewusst ohne Fremdschlüssel (bleibt auch nach Widerruf/Löschen lesbar).
-- Nur der Server (Service-Rolle) liest und schreibt; RLS an, keine Policies.

create table if not exists public.api_schluessel (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  praefix text not null,
  hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_schluessel_profile_idx on public.api_schluessel (profile_id);
alter table public.api_schluessel enable row level security;

create table if not exists public.api_protokoll (
  id bigint generated always as identity primary key,
  schluessel_id uuid,
  profile_id uuid,
  werkzeug text not null,
  argumente jsonb,
  ok boolean not null,
  fehler text,
  created_at timestamptz not null default now()
);
create index if not exists api_protokoll_created_at_idx on public.api_protokoll (created_at);
alter table public.api_protokoll enable row level security;

NOTIFY pgrst, 'reload schema';
