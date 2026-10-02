# Kandidatenwerk

Recruiting-Portal für die Agentur: Bewerber (Leads) kommen aus Meta Lead Ads, Leadtable und Kanzleistelle24, werden Kunden (meist Kanzleien) und deren Kampagnen zugeordnet und durch eine Status-Pipeline geführt. Kunden sehen ihre Kandidaten in einem eigenen Portal.

Live: https://kandidatenwerk.kanzleistelle24.de

## Überblick

| Bereich | Pfad | Wer |
|---|---|---|
| Internes Dashboard | `/dashboard` | Team (`agency_admin`, `agency_member`) |
| Kunden-Portal | `/portal` | Kunden-Logins (`client`) |
| Login / Einladung | `/login`, `/set-password` | alle |

Die Trennung macht [src/middleware.ts](src/middleware.ts) anhand von `profiles.role`. Die eigentliche Absicherung liegt in den RLS-Policies der Datenbank und in Rollenprüfungen der Server Actions ([src/lib/auth-guards.ts](src/lib/auth-guards.ts)).

## Technik

- **Next.js 16 / React 19** (App Router, Server Actions). Achtung: Next 16 hat Breaking Changes, siehe [AGENTS.md](AGENTS.md).
- **Cloudflare Workers** über den OpenNext-Adapter (`@opennextjs/cloudflare`), Einstieg [custom-worker.ts](custom-worker.ts), Konfiguration [wrangler.jsonc](wrangler.jsonc).
- **Supabase**: Postgres mit RLS, Auth, Storage.
- Tailwind 4 + shadcn/ui, Leaflet (Karte), Brevo (Mails), Anthropic API (Extraktion der Zusatzfelder).

## Lokal starten

```bash
npm ci
cp .env.example .env.local   # Werte eintragen
npm run dev                   # http://localhost:3000
```

**Achtung:** Es gibt keine separate Test-Datenbank. Lokal arbeitet die App gegen die Live-Datenbank. Mit `BREVO_API_KEY` gehen echte Mails raus, mit den Leadtable-/Meta-/Kanzleistelle-Schlüsseln werden echte Dienste angesprochen. Schlüssel, die man nicht braucht, leer lassen.

## Umgebungsvariablen

Siehe [.env.example](.env.example). Live sind alle Geheimnisse als Secrets im Cloudflare-Worker hinterlegt (`npx wrangler secret list`); die `NEXT_PUBLIC_*`-Werte werden beim Build eingebaut.

## Deployen

Es gibt keine automatische Auslieferung. Deployt wird von Hand aus einem sauberen Stand von `main`:

```bash
git checkout main && git pull
npm run deploy               # opennextjs-cloudflare build + deploy
```

- Voraussetzung: `npx wrangler login` mit dem Cloudflare-Konto, in dem der Worker `kandidatenwerk` liegt.
- OpenNext baut die Werte aus `.env.local` als Fallback in das Paket ein. Worker-Secrets haben Vorrang, fehlende Secrets würden aber aus `.env.local` gefüllt.
- Rückgängig machen: `npx wrangler rollback`.
- Logs live mitlesen: `npx wrangler tail kandidatenwerk`.

## Hintergrundjobs

| Job | Takt | Wo |
|---|---|---|
| Kampagnen-Automationen (Mails) | alle 5 Min. | Cloudflare Cron → `/api/cron/run-automations` |
| Meta-Leads-Sync | alle 30 Min. | Cloudflare Cron → `/api/cron/meta-leads-sync` |
| Kanzleistelle24-Sync | stündlich | Cloudflare Cron → `/api/cron/sync-kanzleistelle` |
| Erinnerung an fällige Aufgaben | täglich 06:00 UTC | Cloudflare Cron → `/api/cron/task-reminders` |
| Cron-Wächter | täglich | GitHub Actions (`scripts/check-cron-health.ts`) |
| Qualifizierte Kandidaten | alle 4 Std. | GitHub Actions |
| Kampagnen-Rematch | täglich | GitHub Actions |
| Dublettenprüfung | täglich | GitHub Actions |
| Leadtable Full-Sync | – | GitHub Actions, **bewusst deaktiviert** (seit 25.09.2026) |

Die Cloudflare-Crons sind in [wrangler.jsonc](wrangler.jsonc) (`triggers.crons`) und [custom-worker.ts](custom-worker.ts) definiert und rufen die Routen mit `CRON_SECRET` auf. Jeder Lauf wird in `cron_job_runs` protokolliert; bei Fehlschlag bekommen die Admins eine Mail (höchstens alle 12 Std. je Job), der tägliche Cron-Wächter meldet ausbleibende Läufe. Die GitHub-Workflows der drei Cloudflare-Jobs bleiben als manueller Notfall-Start erhalten.

Der Echtzeit-Webhook für Meta liegt unter `/api/webhooks/meta-leadgen` (Signaturprüfung mit `META_APP_SECRET`).

## Datenbank

- Migrationen liegen in [supabase/migrations/](supabase/migrations/) und werden **von Hand im Supabase SQL Editor** ausgeführt, nicht per CLI.
- `service_role` bekommt Rechte auf neue Tabellen, Sequenzen und Funktionen seit `20261002000002_default_privileges_service_role.sql` automatisch. Für `authenticated` (alle Logins, auch Portal-Kunden) bleibt jedes Recht bewusst explizit.

### Checkliste für neue Migrationen

1. **RLS einschalten:** `alter table public.<tabelle> enable row level security;`
2. **Policies schreiben:** Agentur-Daten immer mit `public.current_user_is_staff()` absichern, Portal-Zugriff nur über die Zuordnung zum eigenen Kunden. Ohne Policy für `authenticated` ist die Tabelle für Logins gesperrt (z. B. `bug_reports`, Zugriff nur über Server Actions).
3. **Rechte für Logins:** nur wenn nötig `grant select[, insert, update, delete] on public.<tabelle> to authenticated;` – in derselben Migration, nicht als Nachzügler.
4. **Schema-Cache neu laden:** `notify pgrst, 'reload schema';`
5. **Typen aktualisieren:** `node scripts/gen-types.mjs`
6. **Im SQL Editor ausführen** und danach im Dashboard bzw. mit einem Skript prüfen, dass Lesen/Schreiben mit der vorgesehenen Rolle klappt.
- Typen neu erzeugen: `node scripts/gen-types.mjs` (schreibt `src/types/database.ts`).

## Skripte

Wartungs- und Import-Skripte unter [scripts/](scripts/), Aufruf mit `npx tsx scripts/<name>.ts`. Sie lesen `.env.local` und arbeiten mit dem Service-Role-Schlüssel direkt auf der Live-Datenbank. Die meisten haben einen `--dry-run`- oder `--limit`-Modus; vor dem ersten Lauf den Kopfkommentar des Skripts lesen.

## Projektsteuerung

Aufgaben, Entscheidungen und der Feature-Stand werden in Atlas im Projekt „Kandidatenwerk“ gepflegt.
