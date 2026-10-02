// Auswahlmöglichkeiten für die Zuordnung von Formularfragen (Einstellungen ->
// Lead-Formulare). Eigene Datei ohne Server-Code, damit sie auch im Browser nutzbar ist.
export const CORE_TARGETS = [
  { value: "full_name", label: "Name (vollständig)" },
  { value: "first_name", label: "Vorname" },
  { value: "last_name", label: "Nachname" },
  { value: "email", label: "E-Mail" },
  { value: "phone", label: "Telefon" },
  { value: "plz", label: "PLZ / Wohnort" },
  { value: "berufsbild", label: "Berufsbild" },
] as const

export const SPECIAL_TARGETS = [
  { value: "beschreibung", label: "In die Beschreibung" },
  { value: "ignorieren", label: "Ignorieren" },
] as const
