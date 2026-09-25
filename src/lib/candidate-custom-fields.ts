// Der frühere feste 12-Felder-Satz (FIXED_CUSTOM_FIELDS/FIXED_CUSTOM_FIELD_KEYS) wurde
// am 25.09.2026 durch die DB-gestützte, agenturweit gepflegte Feldliste ersetzt (Tabelle
// custom_field_definitions, siehe src/lib/custom-field-definitions.ts sowie Einstellungen
// -> Zusatzfelder). Dieser Key bleibt als fester, von der dynamischen Liste unabhängiger
// Sonderfall bestehen:

// Sammelfeld für KI-extrahierte Antworten (aus Leadtables modifiedData + description),
// die sich keinem der bekannten Felder eindeutig zuordnen lassen - roher, mehrzeiliger
// Text statt eines einzelnen Werts. Bekommt einen eigenen Anzeige-Block im
// Verlauf-Bereich (siehe history-section.tsx) statt in der generischen "Weitere Felder"-Liste im
// Profil-Tab zu landen - deshalb hier als eigener Key exportiert, den profile-tab.tsx
// explizit aus seiner extraKeys-Liste ausschließt.
export const WEITERE_ANTWORTEN_KEY = "weitere_antworten"
