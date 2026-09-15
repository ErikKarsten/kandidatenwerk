-- Speichert den Zeitpunkt des letzten erfolgreich per Webhook zugestellten
-- Meta-Verbindungstests pro Kampagne (siehe isMetaTestLead in meta-ads-client.ts bzw.
-- handleLeadgenEvent im Webhook). "Testlead anfordern" legt seit dem 15.09.2026 keinen
-- echten Kandidaten mehr an - das kollidierte per E-Mail-Dublettenschutz mit dem
-- allerersten je erzeugten Testlead, egal welche Kampagne gerade getestet wurde, weil
-- Meta bei ALLEN Test-Leads dieselbe Dummy-E-Mail-Adresse verwendet. Stattdessen
-- bestätigt dieses Feld nur, dass die Webhook-Zustellung für GENAU diese
-- Kampagne/dieses Formular funktioniert - unabhängig pro Kampagne prüfbar.
alter table public.campaigns
  add column meta_webhook_last_test_at timestamptz;
