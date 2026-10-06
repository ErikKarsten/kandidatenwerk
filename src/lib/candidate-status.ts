// Einzige Quelle für alle Kandidaten-Pipeline-Status (Value, Label, Farben). Seit Paket 15
// (T-71) ohne Interview/Vorgestellt/Platziert - das bildet der Status der Zuordnung beim
// Kunden ab (src/lib/assignment-status.ts). Jede
// Status-UI (Dropdowns, Badges, Filter, Dashboard-Pipeline) importiert von hier statt
// eigene Kopien zu pflegen. Muss mit der candidates_status_check-Constraint in
// supabase/migrations/20260803000000_extend_candidate_status_options.sql synchron bleiben.
export const CANDIDATE_STATUS_OPTIONS = [
  { value: "neu", label: "Neu", bg: "#4ba3c318", dot: "#4ba3c3", text: "#0e7490" },
  { value: "vorqualifiziert", label: "Vorqualifiziert", bg: "#0ea5e918", dot: "#0ea5e9", text: "#0369a1" },
  { value: "in_pruefung", label: "In Prüfung", bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  { value: "nicht_erreicht", label: "Nicht erreicht", bg: "#f9731618", dot: "#f97316", text: "#c2410c" },
  { value: "nicht_erreicht_mail", label: "2x nicht erreicht + Mail", bg: "#ef444418", dot: "#ef4444", text: "#b91c1c" },
  { value: "in_kontakt", label: "In Kontakt", bg: "#14b8a618", dot: "#14b8a6", text: "#0f766e" },
  { value: "abgelehnt", label: "Abgelehnt", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
] as const

export type CandidateStatusValue = (typeof CANDIDATE_STATUS_OPTIONS)[number]["value"]

export const CANDIDATE_STATUS_FALLBACK_COLORS = { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" }
