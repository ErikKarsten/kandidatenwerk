// Einzige Quelle für den festen Satz an Kandidaten-Zusatzfeldern (Key + Label). Wird
// von profile-tab.tsx (Anzeige/Bearbeitung) UND von leadtable-sync-shared.ts (KI-
// gestützte Befüllung aus der Leadtable-Beschreibung) genutzt, damit beide garantiert
// dieselben 12 Felder kennen. "verfuegbar_ab" behält bewusst diesen Key (nicht
// "startdatum"), da der Leadtable-Backfill vom 2026-07-30 bereits 178 Kandidaten unter
// diesem Key befüllt hat; nur das UI-Label wurde geändert.
export const FIXED_CUSTOM_FIELDS: { key: string; label: string }[] = [
  { key: "ausbildung", label: "Ausbildung" },
  { key: "erreichbarkeit", label: "Erreichbarkeit" },
  { key: "verfuegbar_ab", label: "Startdatum" },
  { key: "wechselgrund", label: "Wechselgrund" },
  { key: "erwartungen_neuer_ag", label: "Erwartungen neuer AG" },
  { key: "bevorzugter_bereich", label: "Welchen Bereich machst du am liebsten" },
  { key: "anzahl_ag_5_jahre", label: "Wie viele AG in den letzten 5 Jahren" },
  { key: "aktuelle_steuerkanzlei", label: "Aktuell Steuerkanzlei" },
  { key: "kanzleigroesse", label: "Wie groß ist diese" },
  { key: "betreute_branchen", label: "Welche Branchen werden betreut" },
  { key: "datev_erfahrung", label: "Erfahrung mit DATEV (offen dafür)" },
  { key: "alter", label: "Alter" },
]

export const FIXED_CUSTOM_FIELD_KEYS = new Set(FIXED_CUSTOM_FIELDS.map((f) => f.key))

// Sammelfeld für KI-extrahierte Antworten (aus Leadtables modifiedData + description),
// die sich keinem der 12 festen Felder oben eindeutig zuordnen lassen - roher,
// mehrzeiliger Text statt eines einzelnen Werts. Bekommt einen eigenen Anzeige-Block im
// Verlauf-Bereich (siehe history-section.tsx) statt in der generischen "Weitere Felder"-Liste im
// Profil-Tab zu landen - deshalb hier als eigener Key exportiert, den profile-tab.tsx
// explizit aus seiner extraKeys-Liste ausschließt.
export const WEITERE_ANTWORTEN_KEY = "weitere_antworten"
