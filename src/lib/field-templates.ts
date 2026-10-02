// Welche Zusatzfelder ein Kandidat zeigt (Paket 8): die Feld-Vorlagen der
// Kanzlei-Kampagnen, denen er zugeordnet ist (Kampagne ohne eigene Vorlage -> Standard-
// vorlage), zusammengeführt in Reihenfolge. Ohne Zuordnung gilt die Standardvorlage,
// ohne Vorlagen überhaupt null = alle Zusatzfelder.
export interface TemplateLite {
  id: string
  field_keys: string[]
  is_default: boolean
}

export function resolveTemplateFieldKeys(templates: TemplateLite[], campaignTemplateIds: (string | null)[]): string[] | null {
  if (templates.length === 0) return null
  const byId = new Map(templates.map((t) => [t.id, t]))
  const fallback = templates.find((t) => t.is_default) ?? null
  const used = campaignTemplateIds.length === 0 ? [fallback] : campaignTemplateIds.map((id) => (id ? byId.get(id) ?? fallback : fallback))
  if (used.every((t) => t === null)) return null
  const keys: string[] = []
  for (const t of used) for (const k of t?.field_keys ?? []) if (!keys.includes(k)) keys.push(k)
  return keys
}
