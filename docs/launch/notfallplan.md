# Datensicherung und Notfallplan (T-104)

## 1. Was wo liegt

| Teil | Wo | Wiederherstellbar über |
|------|----|------------------------|
| Code | GitHub `ErikKarsten/kandidatenwerk` | `git clone` |
| App (Worker) | Cloudflare `kandidatenwerk` | `wrangler rollback`, neu deployen |
| Datenbank-Schema | Supabase, Abzug in `supabase/schema.sql` | `scripts/staging-setup.sh` (erzeugt den Abzug) |
| Daten | Supabase (Live-Projekt) | Supabase-Backups (siehe 2.) |
| Dateien (Lebensläufe, Logos, Fotos) | Supabase Storage | **nicht** in den täglichen DB-Backups enthalten (siehe 2.) |
| Secrets | Cloudflare Worker-Secrets, lokal `.env.local` | Passwortmanager (siehe 4.) |
| DNS | Cloudflare (kanzleistelle24.de) | Cloudflare-Konto |

## 2. Datensicherung

- [ ] **Supabase-Tarif prüfen.** Free hat keine nutzbaren Backups. Pro hat tägliche Backups,
  7 Tage aufbewahrt. Point-in-Time-Recovery gibt es als Zusatz und wird für den Launch empfohlen, weil damit
  jede Minute der letzten Tage wiederherstellbar ist.
- [ ] **Storage-Dateien** sichern Supabase-Backups nicht. Sie müssen wöchentlich per Skript
  in einen zweiten Speicher kopiert werden (eigene Aufgabe, z.B. Cloudflare R2).
- [ ] **Eigener Abzug** einmal im Monat: `LIVE_DB_URL=... bash scripts/staging-setup.sh --nur-dump`
  (nur Schema und Konfiguration) und ein Datenabzug über das Supabase-Dashboard
  (Database > Backups > Download). Ablage verschlüsselt außerhalb von Supabase.
- [ ] **Wiederherstellung einmal üben.** Das letzte Backup in das Staging-Projekt einspielen und
  prüfen, ob Login, Kandidaten und Dateien da sind. Datum hier eintragen: ____

## 3. Notfälle

### App ist kaputt nach einem Deploy

```bash
npx wrangler deployments list
npx wrangler rollback            # auf die vorherige Version
```

Danach den Fehler auf einem Branch beheben und normal deployen. Datenbank-Migrationen werden
**nicht** zurückgerollt. Deshalb Migrationen immer abwärtskompatibel schreiben: erst Spalten
hinzufügen, später entfernen.

### Daten versehentlich gelöscht oder überschrieben

1. Sofort alle Cronjobs stoppen. Dafür in `wrangler.jsonc` die `triggers.crons` leeren und deployen,
   damit Automatisierungen nicht auf kaputten Daten weiterlaufen.
2. Zeitpunkt des Fehlers bestimmen (`candidate_history`, `cron_job_runs`).
3. Mit PITR: Wiederherstellung **in ein neues Projekt** (nicht über Live) und die betroffenen
   Zeilen gezielt zurückkopieren. Ohne PITR: das letzte tägliche Backup.
4. Cronjobs wieder einschalten.

### Supabase ist nicht erreichbar

`/api/health` meldet 503. Prüfen auf status.supabase.com. Es gibt nichts zu tun außer warten und
Kunden informieren (Vorlage unten). Webhooks von Meta und Close werden von den Absendern
wiederholt, Leads gehen in der Regel nicht verloren. Meta-Leads holt außerdem der
30-Minuten-Abgleich nach.

### Schlüssel ist öffentlich geworden

| Schlüssel | Neu erzeugen in | Danach |
|-----------|-----------------|--------|
| `SUPABASE_SECRET_KEY` | Supabase > API Keys | `wrangler secret put`, `.env.local` |
| `BREVO_API_KEY` | Brevo > SMTP & API | `wrangler secret put` |
| `CRON_SECRET` | frei wählen | `wrangler secret put` (gleicher Wert im Worker) |
| `CLOSE_API_KEY` | Close > Settings > API Keys | `wrangler secret put` |
| `CLOSE_WEBHOOK_SIGNATURE_KEY` | `scripts/close-webhook-setup.ts` (Webhook neu) | `wrangler secret put` |
| `BREVO_INBOUND_TOKEN` | frei wählen | `scripts/brevo-inbound-setup.ts`, `wrangler secret put` |
| `META_APP_SECRET` | Meta App > Einstellungen | `wrangler secret put` |
| `ANTHROPIC_API_KEY` | console.anthropic.com | `wrangler secret put` |

Danach die Logs prüfen: Supabase > Logs, Cloudflare > Workers > Logs.

### Verdacht auf Datenleck

1. Betroffenen Zugang sperren (Supabase > Authentication > User > Ban) bzw. Schlüssel tauschen.
2. Umfang festhalten: welche Daten, welche Personen, seit wann.
3. **Meldung an die Aufsichtsbehörde innerhalb von 72 Stunden** (Art. 33 DSGVO), wenn ein Risiko
   für Betroffene nicht ausgeschlossen ist. Bei hohem Risiko auch die Betroffenen informieren.
4. Kanzleien informieren, deren Kandidaten betroffen sind.

## 4. Zugänge (wer kommt wo rein?)

Mindestens **zwei Personen** brauchen Zugang zu jedem Dienst, sonst steht im Notfall alles.

| Dienst | Person 1 | Person 2 |
|--------|----------|----------|
| GitHub | | |
| Cloudflare | | |
| Supabase | | |
| Brevo | | |
| Close / Zapier | | |
| Meta Business | | |
| Anthropic | | |
| Passwortmanager mit allen Secrets | | |

## 5. Vorlage Störungsmeldung an Kanzleien

> Betreff: Kandidatenwerk vorübergehend nicht erreichbar
>
> Guten Tag, das Kundenportal von Kandidatenwerk ist seit [Uhrzeit] nicht erreichbar. Wir
> arbeiten an der Behebung und melden uns, sobald alles wieder läuft. Ihre Daten sind
> nicht betroffen. Bei dringenden Fragen erreichen Sie uns unter [Telefon].
