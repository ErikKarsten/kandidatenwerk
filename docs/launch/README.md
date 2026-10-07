# Launch-Vorbereitung

| Aufgabe | Dokument | Stand |
|---------|----------|-------|
| T-99 Staging | [staging.md](staging.md) | Konfiguration und Skripte fertig, Supabase-Projekt fehlt |
| T-100 Abnahmetests | [abnahmetests.md](abnahmetests.md) | Checkliste fertig, Durchlauf auf Staging offen |
| T-101 E2E-Tests | `e2e/`, `playwright.config.ts` | öffentliche Tests laufen, Login-Tests brauchen Staging |
| T-102 Sicherheit | [sicherheit.md](sicherheit.md) | eigene Prüfung fertig, externer Pentest offen |
| T-103 Datenschutz | [datenschutz.md](datenschutz.md) | Liste fertig, AVVs und Pflichtseiten offen |
| T-104 Notfallplan | [notfallplan.md](notfallplan.md) | Plan fertig, Backup-Tarif und Wiederherstellungsübung offen |
| T-105 Überwachung | [ueberwachung.md](ueberwachung.md) | `/api/health` und Workers Logs fertig, Uptime-Dienst und Sentry offen |
| T-106 Mails, Geräte, Last | [mails-geraete-last.md](mails-geraete-last.md) | DNS geprüft (SPF fehlt), Lasttest-Skript fertig |
| T-107 Pilotphase | [pilotphase.md](pilotphase.md) | Ablauf fertig, Kanzleien auswählen |

## Befehle

```bash
npm test                                                     # Unit-Tests
E2E_BASE_URL=https://… npx playwright test --project=chromium   # E2E (ein Browser)
E2E_BASE_URL=https://… npx playwright test                      # E2E (alle Browser, vorher: npx playwright install)
E2E_BASE_URL=https://… npx tsx scripts/lasttest.ts 20 400       # Lasttest
bash scripts/deploy-staging.sh                               # Staging deployen
```
