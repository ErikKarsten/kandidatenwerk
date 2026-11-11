// Einzige Quelle für den Status einer Zuordnung Kandidat -> Kunde (client_assignments.status).
// Seit Paket 15 (T-71) überall gleich benannt - Backend, Kundenportal, Verlauf, Mails:
// Neu, Vorstellungsgespräch, Eingestellt, Abgelehnt, Bewerber hat abgesagt (Paket 100).
// Der Kunde setzt im Portal alle außer "Neu" (RLS-Policy "Kunde aendert Status der eigenen
// aktiven Zuordnung"). "Abgelehnt" = die Kanzlei sagt ab, "Bewerber hat abgesagt" = der
// Kandidat sagt ab.
export const ASSIGNMENT_STATUS_OPTIONS = [
  { value: "inbox", label: "Neu", bg: "#4ba3c318", text: "#0e7490" },
  { value: "vg", label: "Vorstellungsgespräch", bg: "#1e56a018", text: "#1e56a0" },
  { value: "ja", label: "Eingestellt", bg: "#1a9a6a18", text: "#1a9a6a" },
  { value: "nein", label: "Abgelehnt", bg: "#9ca3af18", text: "#6b7280" },
  { value: "abgesagt", label: "Bewerber hat abgesagt", bg: "#d9770618", text: "#b45309" },
] as const

export type AssignmentStatusValue = (typeof ASSIGNMENT_STATUS_OPTIONS)[number]["value"]

// Werte, die der Kunde selbst setzen darf.
export const PORTAL_ASSIGNMENT_STATUS_VALUES: readonly string[] = ["vg", "ja", "nein", "abgesagt"]

export function assignmentStatusLabel(status: string): { label: string; bg: string; text: string } {
  const opt = ASSIGNMENT_STATUS_OPTIONS.find((o) => o.value === status)
  return opt ? { label: opt.label, bg: opt.bg, text: opt.text } : { label: status, bg: "#9ca3af18", text: "#6b7280" }
}
