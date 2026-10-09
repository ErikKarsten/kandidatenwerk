// Teams zusätzlich zur Rolle (Paket 44): Admin/Mitarbeiter regelt die Rechte, das Team
// ordnet Personen Sales Recruiting oder Vertrieb zu. Aufgaben können einem Team
// zugewiesen werden - im Auswahlfeld als "team:<wert>" neben den Personen-IDs.
export const TEAM_OPTIONS = [
  { value: "sales_recruiting", label: "Sales Recruiting" },
  { value: "vertrieb", label: "Vertrieb" },
] as const

export type Team = (typeof TEAM_OPTIONS)[number]["value"]

const TEAM_PREFIX = "team:"

export function isTeam(value: unknown): value is Team {
  return TEAM_OPTIONS.some((o) => o.value === value)
}

export function teamLabel(team: string | null | undefined): string | null {
  return TEAM_OPTIONS.find((o) => o.value === team)?.label ?? null
}

// Wert für Auswahlfelder: Person (ID) oder Team ("team:vertrieb").
export function assigneeValue(task: { assigned_to: string | null; assigned_team?: string | null }): string {
  return task.assigned_team ? `${TEAM_PREFIX}${task.assigned_team}` : (task.assigned_to ?? "")
}

export function parseAssignee(value: string): { assigned_to: string | null; assigned_team: Team | null } | null {
  if (value.startsWith(TEAM_PREFIX)) {
    const team = value.slice(TEAM_PREFIX.length)
    return isTeam(team) ? { assigned_to: null, assigned_team: team } : null
  }
  return value ? { assigned_to: value, assigned_team: null } : null
}

// "Mir zugewiesen": direkt oder über das eigene Team.
export function isAssignedTo(task: { assigned_to: string | null; assigned_team?: string | null }, userId: string, userTeam: string | null): boolean {
  return task.assigned_to === userId || (!!userTeam && task.assigned_team === userTeam)
}

// Anzeige "Zugewiesen": Team oder Personenname.
export function assigneeLabel(task: { assigned_team?: string | null }, personName: string | null): string {
  const team = teamLabel(task.assigned_team)
  return team ? `Team ${team}` : (personName ?? "Unbenannt")
}

// Musterdatensätze anlegen dürfen nur Admins und der Vertrieb (Paket 44).
export function canCreateSamples(profile: { role: string | null; team: string | null } | null): boolean {
  return !!profile && (profile.role === "agency_admin" || profile.team === "vertrieb")
}
