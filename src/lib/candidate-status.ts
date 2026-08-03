// Einzige Quelle für alle Kandidaten-Pipeline-Status (Value, Label, Farben). Jede
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
  { value: "interview", label: "Interview", bg: "#1e56a018", dot: "#1e56a0", text: "#1e56a0" },
  { value: "vorgestellt", label: "Vorgestellt", bg: "#8b5cf618", dot: "#8b5cf6", text: "#7c3aed" },
  { value: "platziert", label: "Platziert", bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  { value: "abgelehnt", label: "Abgelehnt", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
] as const

export type CandidateStatusValue = (typeof CANDIDATE_STATUS_OPTIONS)[number]["value"]

export const CANDIDATE_STATUS_FALLBACK_COLORS = { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" }
