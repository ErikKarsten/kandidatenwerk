# Sicherheitsprüfung (T-102)

Eigene Prüfung vom 07.10.2026. Sie ersetzt keinen externen Pentest, macht ihn aber
günstiger und gezielter.

## Ergebnisse

| Bereich | Prüfung | Ergebnis |
|---------|---------|----------|
| Abhängigkeiten | `npm audit --omit=dev` | ✅ 0 Lücken, nachdem Next.js von 16.2.11 auf 16.3.8 aktualisiert wurde. Die alte Version hatte 3 **kritische** Lücken (u.a. Remote Code Execution) |
| Datenbank ohne Login | alle 37 Tabellen/Views mit dem öffentlichen Schlüssel lesen und schreiben | ✅ alles abgelehnt (401), das Schema ist nicht einsehbar |
| API-Routen | Absicherung jeder Route | ✅ Cron: Secret (jetzt zeitkonstant verglichen). Meta und Close: HMAC-Signatur. Brevo: Token. Zapier: Secret. Fehlt ein Secret, wird alles abgelehnt |
| Server-Aktionen | Guard in jeder `"use server"`-Datei | ✅ alle mit Staff-, Admin- oder Login-Prüfung. Ausnahme ist „Passwort vergessen“, das gewollt öffentlich ist und ein Rate-Limit hat |
| Portal/Dashboard-Trennung | Middleware und Aktionen | ✅ Kanzleien werden aus `/dashboard` umgeleitet, Aktionen prüfen zusätzlich die Rolle |
| Admin-Client (umgeht RLS) | Nutzung mit IDs aus Anfragen | ✅ im Portal nur nach RLS-geprüfter Zuordnung. **Behoben:** Ein Statuswechsel, den RLS ablehnte, schrieb trotzdem einen Verlaufseintrag |
| HTTP-Header | Live-Abruf | ✅ HSTS (preload), X-Frame-Options DENY, nosniff, Referrer-Policy. ⚠️ keine Content-Security-Policy (siehe unten) |
| Mail-Domain | SPF/DKIM/DMARC | ⚠️ SPF fehlt (siehe `mails-geraete-last.md`) |

## Offene Punkte (geringes Risiko)

- **Content-Security-Policy:** Sie würde eingeschleuste Skripte zusätzlich blockieren. Next.js braucht dafür
  Nonces in der Middleware. Das wird nach dem Launch eingebaut und zuerst im Report-Only-Modus getestet.
- **Close-Webhook ohne Zeitfenster:** Eine abgefangene Zustellung ließe sich wiederholen. Das ist harmlos, weil
  die Besprechung ohnehin frisch über die Close-API gelesen und nur einmal verarbeitet wird.
- **Brevo-Inbound-Token in der URL:** Er steht in Brevo-Logs. Bei Verdacht nach `notfallplan.md` tauschen.

## Externer Pentest: Umfang für das Angebot

- **Ziel:** Staging-Umgebung (siehe `staging.md`), nicht Live
- **Rollen:** Agentur-Admin, Agentur-Mitarbeiter, zwei Kanzleien (Portal). Zugänge werden gestellt
- **Schwerpunkte:**
  1. Kanzlei A darf keine Daten von Kanzlei B sehen (IDOR, RLS-Umgehung über Server-Aktionen)
  2. Mitarbeiter darf keine Admin-Funktionen nutzen (Team, Einstellungen)
  3. Webhooks (Meta, Close, Brevo-Inbound, Zapier): Fälschung, Wiederholung, Injection
  4. Datei-Uploads (Lebensläufe, Logos, Fotos): Typ, Größe, Zugriff auf fremde Dateien
  5. Login, Passwort vergessen, Einladungslinks: Enumeration, Brute Force, Link-Wiederverwendung
  6. HTML in Mail-Vorlagen und Kandidatenantworten (XSS im Dashboard)
- **Nicht im Umfang:** Supabase, Cloudflare und Brevo selbst sowie Denial of Service
- **Aufwand:** üblicherweise 3–5 Personentage für diesen Umfang
