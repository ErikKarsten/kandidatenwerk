# Staging (T-99, Paket 102)

Eine zweite, vollständige Kandidatenwerk-Umgebung mit **eigener Datenbank und Testdaten**.
Neue Pakete werden zuerst hier geprüft, danach geht es live.

| | Lokal (`npm run dev`) | Staging | Live |
|---|---|---|---|
| Adresse | localhost:3000 | kandidatenwerk-staging.<konto>.workers.dev | kandidatenwerk.kanzleistelle24.de |
| Datenbank | Staging | Staging | Live |
| Konfiguration | `.env.staging` | `.env.staging` | `.env.local` |
| Mails | nur `MAIL_ALLOWLIST` | nur `MAIL_ALLOWLIST`, Betreff „[Staging]“ | alle |
| Meta, Close, Leadtable, Kanzleistelle24 | aus | aus | an |

Gegen die Live-Datenbank lokal nur noch bewusst: `npm run dev:live`.

## Warum Live-Schlüssel nie nach Staging gelangen

OpenNext packt beim Bauen **alle** `.env`-Dateien in den Worker. `scripts/deploy-staging.sh`
legt deshalb `.env.local` während des Bauens zur Seite und prüft vor dem Hochladen mit
`scripts/staging-build-check.mjs`, dass kein Live-Wert im Staging-Worker steckt. Umgekehrt
bricht `npm run deploy` (Live) über `scripts/check-live-env.sh` ab, wenn noch Staging-Dateien
herumliegen, z. B. nach einem abgebrochenen Staging-Deploy.

## Einmalig einrichten

1. Supabase-Projekt für Staging anlegen (EU-Region).
2. `.env.staging` ausfüllen (Vorlage `.env.staging.example`): URL, Publishable Key, Secret Key,
   `MAIL_ALLOWLIST`, Brevo-Schlüssel, Staging-Admin-Login.
3. Postgres.app installieren. Dann Struktur und Einstellungen von Live nach Staging kopieren
   (liest von Live nur, schreibt nur nach Staging; Verbindungen unter Supabase > Connect >
   Session pooler):
   ```bash
   bash scripts/staging-setup.sh
   ```
4. Testdaten anlegen: `npx tsx scripts/staging-seed.ts` (ohne `STAGING_ADMIN_PASSWORD` gibt das Skript
   Links zum Passwort-Setzen aus)
5. Im Staging-Supabase unter Authentication > URL Configuration Site URL und Redirect URLs auf
   die Staging-Adresse setzen; Mail-Vorlagen aus `supabase/email-templates/` übernehmen. Keine
   eigene SMTP-Verbindung eintragen - der eingebaute Versand von Supabase schickt nur an
   Mitglieder des Supabase-Teams.
6. Cron-Schlüssel für Staging setzen (neuen Wert wählen): `npx wrangler secret put CRON_SECRET --env staging`
7. Deployen: `npm run deploy:staging`. Die angezeigte workers.dev-Adresse als
   `NEXT_PUBLIC_APP_URL` in `.env.staging` eintragen und noch einmal deployen.

## Ablauf je Paket

1. Branch auf Staging: `npm run deploy:staging`
2. Neue Migrationen zuerst im **Staging**-SQL-Editor ausführen.
3. Codex prüft den Pull Request; Änderung auf Staging durchklicken (`abnahmetests.md`).
4. Nach dem OK: Migration auf Live, PR mergen, `npm run deploy`.

## Sicherheitsnetze

- `deploy-staging.sh`, `dev-staging.sh` und `staging-seed.ts` brechen ab, wenn `.env.staging` fehlt
  oder auf die Live-Datenbank zeigt.
- `staging-setup.sh` bricht ab, wenn Staging zum Live-Projekt gehört oder schon Tabellen hat.
- Mail-Sperre (`src/lib/mail-guard.ts`): auf Staging nur an `MAIL_ALLOWLIST`, sonst nichts.
