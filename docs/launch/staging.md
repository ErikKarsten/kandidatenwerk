# Staging (T-99)

Eine zweite, vollständige Kandidatenwerk-Umgebung mit **eigener Datenbank und Testdaten**.
Neue Pakete werden zuerst hier geprüft (Abnahmetests, E2E-Tests). Danach geht es live.
Bisher lief alles, auch lokal, gegen die Live-Datenbank.

| | Live | Staging |
|---|------|---------|
| Adresse | kandidatenwerk.kanzleistelle24.de | kandidatenwerk-staging.<konto>.workers.dev |
| Worker | `kandidatenwerk` | `kandidatenwerk-staging` |
| Supabase | Live-Projekt | eigenes Projekt (Free reicht) |
| Konfiguration | `.env.local` | `.env.staging` |

## Einmalig einrichten

1. Ein neues Supabase-Projekt „kandidatenwerk-staging“ in der EU-Region anlegen.
2. `cp .env.staging.example .env.staging` und URL, Publishable Key, Secret Key sowie den
   Staging-Admin-Login eintragen.
3. Postgres-Werkzeuge installieren (Postgres.app). Dann Schema und Konfiguration übertragen:
   ```bash
   LIVE_DB_URL='…' STAGING_DB_URL='…' bash scripts/staging-setup.sh
   ```
4. Testdaten anlegen: `npx tsx scripts/staging-seed.ts`
5. Im Staging-Supabase unter Authentication > URL Configuration die Site URL auf die
   workers.dev-Adresse setzen. Die Mail-Vorlagen aus `supabase/email-templates/` übernehmen.
6. Worker-Secrets setzen, jeweils `npx wrangler secret put <NAME> --env staging`:
   - `SUPABASE_SECRET_KEY` (Staging), `CRON_SECRET` (neu wählen), `BREVO_API_KEY`
   - **nicht** setzen: Meta-, Leadtable-, Kanzleistelle-, Close-Schlüssel. Sonst greift Staging
     auf echte Kampagnen, Leads und Stellen zu. Die Cronjobs dafür laufen dann ins Leere.
7. Deployen: `bash scripts/deploy-staging.sh`

## Ablauf je Paket

1. Branch deployen: `bash scripts/deploy-staging.sh`
2. Neue Migrationen im **Staging**-SQL-Editor einspielen.
3. E2E-Tests: `E2E_BASE_URL=https://kandidatenwerk-staging…workers.dev npx playwright test`
4. Betroffene Abnahmetests (`abnahmetests.md`) durchklicken.
5. Danach Migration auf Live, PR mergen, `npm run deploy`.

## Sicherheitsnetze

- `deploy-staging.sh` und `staging-seed.ts` brechen ab, wenn `.env.staging` auf die Live-Datenbank zeigt.
- `staging-setup.sh` bricht ab, wenn `STAGING_DB_URL` gleich `LIVE_DB_URL` ist.
- Alle Test-E-Mail-Adressen sind Plus-Adressen des Staging-Admins.
