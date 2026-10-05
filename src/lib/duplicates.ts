// Dublettenprüfung (Paket 14, T-66): findet Verdachtsfälle für Kunden und Kandidaten
// und legt sie als duplicate_cases an (Sektion "Dubletten" bei den Fehlermeldungen).
// Ein Fall ist über seine Signatur (Art + sortierte IDs) eindeutig - ignorierte oder
// erledigte Fälle werden dadurch nie erneut angelegt.
//
// Kunden: gleiche PLZ + ähnlicher Name (Rechtsform-Kürzel ignoriert, mind. 60 % der
// Begriffe des kürzeren Namens auch im anderen).
// Kandidaten: gleiche E-Mail-Adresse, oder gleicher Name + gleiche PLZ.
import type { SupabaseClient } from "@supabase/supabase-js"

export type DuplicateKind = "kunde" | "kandidat"

export interface DuplicateFinding {
  kind: DuplicateKind
  recordIds: string[]
  reason: string
}

const SIMILARITY_THRESHOLD = 0.6
const LEGAL_FORM_TOKENS = new Set(["gmbh", "mbh", "mbb", "kg", "ohg", "gbr", "ug", "ag", "se", "partg", "ek", "eg", "co"])

export function tokenizeClientName(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zäöüß0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !LEGAL_FORM_TOKENS.has(t))
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const t of a) if (b.has(t)) common++
  return common / Math.min(a.size, b.size)
}

export function findClientDuplicates(clients: { id: string; name: string; plz: string | null }[]): DuplicateFinding[] {
  const byPlz = new Map<string, typeof clients>()
  for (const c of clients) {
    const plz = c.plz?.trim()
    if (plz) byPlz.set(plz, [...(byPlz.get(plz) ?? []), c])
  }
  const findings: DuplicateFinding[] = []
  for (const [plz, list] of byPlz) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = new Set(tokenizeClientName(list[i].name))
        const b = new Set(tokenizeClientName(list[j].name))
        if (overlap(a, b) >= SIMILARITY_THRESHOLD) {
          findings.push({ kind: "kunde", recordIds: [list[i].id, list[j].id], reason: `Gleiche PLZ ${plz} und ähnlicher Name` })
        }
      }
    }
  }
  return findings
}

export function findCandidateDuplicates(
  candidates: { id: string; first_name: string; last_name: string; email: string | null; plz: string | null }[]
): DuplicateFinding[] {
  const findings: DuplicateFinding[] = []
  const seenPairs = new Set<string>()
  const addGroups = (groups: Map<string, string[]>, reason: (key: string) => string) => {
    for (const [key, ids] of groups) {
      if (ids.length < 2) continue
      const sorted = [...ids].sort()
      const pairKey = sorted.join(",")
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)
      findings.push({ kind: "kandidat", recordIds: sorted, reason: reason(key) })
    }
  }
  const byEmail = new Map<string, string[]>()
  const byNamePlz = new Map<string, string[]>()
  for (const c of candidates) {
    const email = c.email?.trim().toLowerCase()
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), c.id])
    const name = `${c.first_name} ${c.last_name}`.trim().toLowerCase().replace(/\s+/g, " ")
    const plz = c.plz?.trim()
    if (name && plz) byNamePlz.set(`${name}|${plz}`, [...(byNamePlz.get(`${name}|${plz}`) ?? []), c.id])
  }
  addGroups(byEmail, (email) => `Gleiche E-Mail-Adresse ${email}`)
  addGroups(byNamePlz, (key) => `Gleicher Name und gleiche PLZ ${key.split("|")[1]}`)
  return findings
}

export function caseSignature(kind: DuplicateKind, recordIds: string[]): string {
  return `${kind}:${[...recordIds].sort().join(",")}`
}

// Seitenweise laden (PostgREST liefert höchstens 1000 Zeilen je Anfrage).
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return rows
}

// Prüft alle Kunden und Kandidaten und legt neue Fälle an. Liefert die neu angelegten.
export async function runDuplicateDetection(db: SupabaseClient): Promise<{ newCases: DuplicateFinding[]; total: number }> {
  const [clients, candidates] = await Promise.all([
    fetchAll<{ id: string; name: string; plz: string | null }>((from, to) =>
      db.from("clients").select("id, name, plz").neq("status", "Archiviert").range(from, to)
    ),
    fetchAll<{ id: string; first_name: string; last_name: string; email: string | null; plz: string | null }>((from, to) =>
      db.from("candidates").select("id, first_name, last_name, email, plz").eq("is_demo", false).range(from, to)
    ),
  ])
  const findings = [...findClientDuplicates(clients), ...findCandidateDuplicates(candidates)]
  const { data: existing } = await db.from("duplicate_cases").select("signature")
  const known = new Set((existing ?? []).map((r) => r.signature as string))
  const { data: agency } = await db.from("agencies").select("id").limit(1).maybeSingle()
  const newCases = findings.filter((f) => !known.has(caseSignature(f.kind, f.recordIds)))
  if (newCases.length > 0) {
    const { error } = await db.from("duplicate_cases").upsert(
      newCases.map((f) => ({
        agency_id: agency?.id ?? null,
        kind: f.kind,
        record_ids: [...f.recordIds].sort(),
        reason: f.reason,
        signature: caseSignature(f.kind, f.recordIds),
      })),
      { onConflict: "signature", ignoreDuplicates: true }
    )
    if (error) throw new Error(error.message)
  }
  return { newCases, total: findings.length }
}
