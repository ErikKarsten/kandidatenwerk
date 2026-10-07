// Tags für Kandidaten (Paket 28, T-115), z.B. "Musterdatensatz" für die fiktiven
// Beispielprofile. Client-tauglich.
export const SAMPLE_TAG = "Musterdatensatz"
const MAX_TAG_LENGTH = 30
const MAX_TAGS = 10

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH)
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out.slice(0, MAX_TAGS)
}

// Im anonymisierten Modus werden interne Tags (Musterdatensatz) nicht gezeigt.
export function visibleTags(tags: string[] | null | undefined, showMode: boolean): string[] {
  return (tags ?? []).filter((t) => !(showMode && t === SAMPLE_TAG))
}
