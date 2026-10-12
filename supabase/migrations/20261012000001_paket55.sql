-- Paket 55: Eigene Links zum Passwort-Setzen (Team und Kundenportal), ohne Ablaufzeit.
-- Supabase-Einmal-Links verfallen nach kurzer Zeit und werden von Link-Vorschauen
-- (Teams, WhatsApp, Mail) beim Öffnen verbraucht. Diese Links werden erst beim Speichern
-- des neuen Passworts verbraucht; ein neuer Link ersetzt den alten. Gespeichert wird nur
-- der Hash des Tokens. Zugriff nur serverseitig (Service-Role), keine Policies.
create table if not exists public.password_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists password_links_user_idx on public.password_links (user_id);
alter table public.password_links enable row level security;
grant all on public.password_links to service_role;
