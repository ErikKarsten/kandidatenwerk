// Einzige Quelle für alle Kandidaten-Pipeline-Status (Value, Label, Farben). Seit Paket 15
// (T-71) ohne Interview/Vorgestellt/Platziert - das bildet der Status der Zuordnung beim
// Kunden ab (src/lib/assignment-status.ts). Jede
// Status-UI (Dropdowns, Badges, Filter, Dashboard-Pipeline) importiert von hier statt
// eigene Kopien zu pflegen. Muss mit der candidates_status_check-Constraint in
// supabase/migrations/20260803000000_extend_candidate_status_options.sql synchron bleiben.
export const CANDIDATE_STATUS_OPTIONS = [
  // Neu = Blau, Vorqualifiziert = Grün (Paket 66) - vorher zwei Blautöne, kaum zu unterscheiden.
  { value: "neu", label: "Neu", bg: "#2563eb18", dot: "#2563eb", text: "#1d4ed8" },
  { value: "vorqualifiziert", label: "Vorqualifiziert", bg: "#16a34a1f", dot: "#16a34a", text: "#15803d" },
  { value: "in_pruefung", label: "In Prüfung", bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  { value: "nicht_erreicht", label: "Nicht erreicht", bg: "#f9731618", dot: "#f97316", text: "#c2410c" },
  { value: "nicht_erreicht_mail", label: "2x nicht erreicht + Mail", bg: "#ef444418", dot: "#ef4444", text: "#b91c1c" },
  { value: "in_kontakt", label: "In Kontakt", bg: "#14b8a618", dot: "#14b8a6", text: "#0f766e" },
  { value: "abgelehnt", label: "Abgelehnt", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
] as const

export type CandidateStatusValue = (typeof CANDIDATE_STATUS_OPTIONS)[number]["value"]

export const CANDIDATE_STATUS_FALLBACK_COLORS = { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" }
