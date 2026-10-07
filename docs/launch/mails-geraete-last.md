# Mails, Geräte und Last (T-106)

## 1. Mail-Zustellbarkeit

DNS-Prüfung vom 07.10.2026:

| Eintrag | kanzleistelle24.de | Bewertung |
|---------|--------------------|-----------|
| DKIM (Brevo, `brevo1`/`brevo2._domainkey`) | vorhanden | ✅ Brevo-Mails sind signiert, DMARC besteht |
| DMARC | `p=none`, Berichte an Brevo | ⚠️ ok für den Start; nach 4 Wochen ohne Probleme auf `p=quarantine` |
| **SPF** | **fehlt** | ❌ Ohne SPF kann jeder `info@kanzleistelle24.de` fälschen, Mails aus dem Strato-Postfach landen eher im Spam |
| MX | Strato (`smtpin.rzone.de`) | ✅ |
| Antwort-Domain `antwort.` | MX Brevo Inbound, DMARC | ✅ |

**Zu tun (Team, Cloudflare-DNS):** TXT-Eintrag auf `kanzleistelle24.de`. Den genauen Wert vorher
bei Strato erfragen, falls dort weitere Absender laufen:

```
v=spf1 include:spf.brevo.com include:smtp.rzone.de ~all
```

**Test mit mail-tester.com:** Die angezeigte Adresse als Kandidaten-E-Mail auf Staging eintragen und eine
Mail über den Reiter Kommunikation und eine Automatisierung senden. Ziel: mindestens 9/10.

**In Postfächern ansehen:** Gmail, Outlook/Microsoft 365, GMX/Web.de, Apple Mail (hell und dunkel).
Prüfen: Logo, Button „Bewerberprofil öffnen“, Umlaute, Absendername, Antwort-an.

## 2. Geräte und Browser

| Gerät / Browser | Dashboard | Portal | Mails |
|-----------------|-----------|--------|-------|
| Windows + Chrome | | | |
| Windows + Edge | | | |
| Mac + Safari | | | |
| Mac + Firefox | | | |
| iPhone + Safari | (eingeschränkt ok) | | |
| Android + Chrome | (eingeschränkt ok) | | |

Kanzleien arbeiten oft mit Edge auf Windows und älteren Bildschirmen (1366 × 768). Das Portal
muss dort ohne waagrechtes Scrollen funktionieren. Die Playwright-Tests decken Chrome,
Firefox, Safari (WebKit) und ein Handy-Format automatisch ab (`e2e/`).

## 3. Last

```bash
E2E_BASE_URL=https://<staging> npx tsx scripts/lasttest.ts 20 400
```

Ziel: p95 unter 1,5 s, keine 5xx. Erwartete Last zum Launch ist gering (Agentur-Team plus
einige Kanzleien). Engpässe liegen eher bei:

- **Cronjobs**: Cloudflare erlaubt 1000 Unteranfragen je Lauf. `run-automations` fragt in
  Paketen ab. Bei mehreren tausend Kandidaten je Kampagne die Laufzeit in `cron_job_runs` beobachten.
- **Brevo-Kontingent**: Tageslimit des Tarifs gegen die erwartete Mailmenge prüfen
  (Eingangsbestätigungen + Automatisierungen).
- **Supabase**: Verbindungen und Abfragezeiten unter Reports.
