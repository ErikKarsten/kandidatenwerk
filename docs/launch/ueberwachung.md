# Überwachung (T-105)

## Bereits vorhanden

- **Cronjob-Fehler**: `cron_job_runs` plus Mail an die Agentur-Admins (höchstens alle 12 h je Job)
  und ein Eintrag unter „Fehlermeldungen“.
- **Fehler melden**: Nutzer melden Fehler mit Screenshot direkt aus der App.

## Neu: `/api/health`

`GET https://kandidatenwerk.kanzleistelle24.de/api/health` antwortet:

- `200 {"ok":true,"checks":{"database":true,"cron":true}}`, wenn alles läuft.
- `503`, wenn die Datenbank nicht erreichbar ist oder `run-automations` seit über 20 Minuten nicht
  gelaufen ist. Das ist der Fall, wenn der Cron-Trigger ausgefallen ist. Dafür gab es bisher keinen
  Alarm, weil dann gar kein Lauf scheitert.

Die Antwort enthält keine Daten.

## Einrichten (Team)

1. **Uptime-Dienst** (z.B. Better Stack oder UptimeRobot, kostenlos):
   - Monitor 1: `/api/health` alle 5 Minuten, Alarm bei Status ≠ 200, per Mail und SMS/App.
   - Monitor 2: `/login` alle 5 Minuten (Seite liefert 200).
2. **Fehler-Tracking** (Sentry, kostenlos bis 5.000 Fehler/Monat). Dafür brauche ich ein Konto
   und den DSN, dann baue ich `@sentry/cloudflare` in den Worker ein. Ohne Sentry sieht man
   Serverfehler nur live in Cloudflare > Workers > Logs.
3. **Cloudflare Workers Logs** sind ab diesem Deploy eingeschaltet (`observability` in
   `wrangler.jsonc`). Zu finden unter Workers > kandidatenwerk > Logs, gespeichert für 3 Tage.
4. **Supabase**: Reports > Database im Blick behalten (Verbindungen, Speicher).
5. **Brevo**: Bounce- und Spam-Rate wöchentlich ansehen (Statistics > Email).
