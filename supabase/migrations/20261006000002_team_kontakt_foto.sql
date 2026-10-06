-- Paket 15 (06.10.2026), T-73: Ansprechpartner im Kundenportal.
-- Team-Mitglieder bekommen Telefonnummer und Foto (Pflicht beim Anlegen/Bearbeiten).
-- Der Key Account Manager eines Kunden erscheint mit Foto, E-Mail und Telefon im
-- Portal-Dashboard. Fotos liegen im privaten Bucket team-avatars und werden nur
-- serverseitig (Service-Role) mit signierten Links ausgeliefert.
alter table public.profiles
  add column if not exists phone text,
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-avatars', 'team-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
