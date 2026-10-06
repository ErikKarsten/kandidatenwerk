// Zusammenführen von Dubletten (Paket 14, T-66). Der behaltene Datensatz übernimmt
// alles Verknüpfte des anderen; leere Felder werden aus dem anderen aufgefüllt, danach
// wird der andere gelöscht. Eindeutige Kennungen (Meta-/Leadtable-/Close-ID usw.)
// werden erst beim gelöschten Datensatz geleert und dann übertragen.
import type { SupabaseClient } from "@supabase/supabase-js"

type Row = Record<string, unknown>

const empty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "")

function fillEmpty(keep: Row, other: Row, fields: string[]): Row {
  const patch: Row = {}
  for (const f of fields) if (empty(keep[f]) && !empty(other[f])) patch[f] = other[f]
  return patch
}

async function check<T>(p: PromiseLike<{ error: { message: string } | null; data?: T }>, what: string): Promise<T | undefined> {
  const { error, data } = await p
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

const CANDIDATE_FIELDS = ["email", "phone", "plz", "lat", "lng", "berufsbild", "description"]
const CANDIDATE_UNIQUE = ["meta_lead_id", "leadtable_lead_id", "kanzleistelle_application_id"]

export async function mergeCandidates(db: SupabaseClient, keepId: string, otherId: string): Promise<void> {
  const { data: rows } = await db.from("candidates").select("*").in("id", [keepId, otherId])
  const keep = rows?.find((r) => r.id === keepId)
  const other = rows?.find((r) => r.id === otherId)
  if (!keep || !other) throw new Error("Kandidat nicht gefunden.")

  // Zuordnungen: doppelte aktive Zuordnung zur selben Kanzlei verwerfen, Rest umhängen.
  const { data: assignments } = await db.from("client_assignments").select("id, client_id, candidate_id, removed_at").in("candidate_id", [keepId, otherId])
  const keepClients = new Set((assignments ?? []).filter((a) => a.candidate_id === keepId && !a.removed_at).map((a) => a.client_id))
  for (const a of (assignments ?? []).filter((x) => x.candidate_id === otherId)) {
    if (!a.removed_at && keepClients.has(a.client_id)) await check(db.from("client_assignments").delete().eq("id", a.id), "Zuordnung")
    else await check(db.from("client_assignments").update({ candidate_id: keepId }).eq("id", a.id), "Zuordnung")
  }
  for (const table of ["candidate_history", "candidate_files", "tasks"]) {
    await check(db.from(table).update({ candidate_id: keepId }).eq("candidate_id", otherId), table)
  }
  await check(db.from("candidate_campaign_matches").delete().eq("candidate_id", otherId), "Matching-Treffer")

  const patch: Row = fillEmpty(keep, other, [...CANDIDATE_FIELDS, ...CANDIDATE_UNIQUE])
  const keepFields = (keep.custom_fields as Row | null) ?? {}
  const otherFields = (other.custom_fields as Row | null) ?? {}
  const mergedFields = { ...otherFields, ...Object.fromEntries(Object.entries(keepFields).filter(([, v]) => !empty(v))) }
  if (JSON.stringify(mergedFields) !== JSON.stringify(keepFields)) patch.custom_fields = mergedFields
  const otherNotes = (other.notes as string | null)?.trim()
  if (otherNotes && !((keep.notes as string | null) ?? "").includes(otherNotes)) {
    patch.notes = [keep.notes, `Aus zusammengeführter Dublette:\n${otherNotes}`].filter(Boolean).join("\n\n")
  }

  const uniqueToMove = CANDIDATE_UNIQUE.filter((f) => f in patch)
  if (uniqueToMove.length > 0) {
    await check(db.from("candidates").update(Object.fromEntries(uniqueToMove.map((f) => [f, null]))).eq("id", otherId), "Kennungen lösen")
  }
  if (Object.keys(patch).length > 0) await check(db.from("candidates").update(patch).eq("id", keepId), "Kandidat aktualisieren")
  await check(
    db.from("candidate_history").insert({
      candidate_id: keepId,
      type: "note",
      content: `Dublette zusammengeführt: ${`${other.first_name ?? ""} ${other.last_name ?? ""}`.trim() || "ohne Namen"} (${other.email ?? "ohne E-Mail"}).`,
    }),
    "Verlauf"
  )
  await check(db.from("candidates").delete().eq("id", otherId), "Dublette löschen")
}

const CLIENT_FIELDS = ["contact_email", "contact_name", "phone", "logo_url", "plz", "lat", "lng", "ort", "contract_start", "contract_term_months", "key_account_manager_id"]
const CLIENT_UNIQUE = ["leadtable_customer_id", "kanzleistelle_company_id", "close_lead_id"]
const PROFILE_FIELDS = [
  "kurzbeschreibung", "intro", "website", "mitarbeiterzahl", "standorte", "mandantenstruktur", "software", "arbeitszeiten",
  "homeoffice", "gehaltsgefuege", "ansprechpartner_bewerbung", "painpoints", "ziele_zusammenarbeit", "vertriebsnotizen",
]

export async function mergeClients(db: SupabaseClient, keepId: string, otherId: string): Promise<void> {
  const { data: rows } = await db.from("clients").select("*").in("id", [keepId, otherId])
  const keep = rows?.find((r) => r.id === keepId)
  const other = rows?.find((r) => r.id === otherId)
  if (!keep || !other) throw new Error("Kunde nicht gefunden.")

  // Zuordnungen: gleicher Kandidat schon aktiv beim behaltenen Kunden -> verwerfen.
  const { data: assignments } = await db.from("client_assignments").select("id, client_id, candidate_id, removed_at").in("client_id", [keepId, otherId])
  const keepCandidates = new Set((assignments ?? []).filter((a) => a.client_id === keepId && !a.removed_at).map((a) => a.candidate_id))
  for (const a of (assignments ?? []).filter((x) => x.client_id === otherId)) {
    if (!a.removed_at && keepCandidates.has(a.candidate_id)) await check(db.from("client_assignments").delete().eq("id", a.id), "Zuordnung")
    else await check(db.from("client_assignments").update({ client_id: keepId }).eq("id", a.id), "Zuordnung")
  }
  for (const table of ["campaigns", "client_contacts", "client_files", "client_comments", "client_positions", "tasks", "bug_reports", "profiles"]) {
    await check(db.from(table).update({ client_id: keepId }).eq("client_id", otherId), table)
  }

  // Standorte (Paket 16): fehlende PLZ als weitere Standorte übernehmen, nie als zweiten
  // Hauptstandort. Hat der behaltene Kunde keinen Hauptstandort, wird der erste übernommene es.
  const { data: locs } = await db.from("client_locations").select("id, client_id, plz, is_primary").in("client_id", [keepId, otherId])
  const keepLocs = (locs ?? []).filter((l) => l.client_id === keepId)
  let hasPrimary = keepLocs.some((l) => l.is_primary)
  for (const l of (locs ?? []).filter((x) => x.client_id === otherId)) {
    if (keepLocs.some((k) => k.plz === l.plz)) continue
    await check(db.from("client_locations").update({ client_id: keepId, is_primary: !hasPrimary }).eq("id", l.id), "Standort")
    hasPrimary = true
  }

  // Kanzleiprofil: fehlt es beim behaltenen Kunden, wird es übernommen, sonst aufgefüllt.
  const { data: profiles } = await db.from("client_profiles").select("*").in("client_id", [keepId, otherId])
  const keepProfile = profiles?.find((p) => p.client_id === keepId)
  const otherProfile = profiles?.find((p) => p.client_id === otherId)
  if (otherProfile && !keepProfile) {
    await check(db.from("client_profiles").update({ client_id: keepId }).eq("client_id", otherId), "Profil übernehmen")
  } else if (otherProfile && keepProfile) {
    const patch = fillEmpty(keepProfile, otherProfile, PROFILE_FIELDS)
    if (!((keepProfile.benefits as string[] | null) ?? []).length && ((otherProfile.benefits as string[] | null) ?? []).length) patch.benefits = otherProfile.benefits
    if (Object.keys(patch).length > 0) await check(db.from("client_profiles").update(patch).eq("client_id", keepId), "Profil auffüllen")
  }

  const patch = fillEmpty(keep, other, [...CLIENT_FIELDS, ...CLIENT_UNIQUE])
  const uniqueToMove = CLIENT_UNIQUE.filter((f) => f in patch)
  if (uniqueToMove.length > 0) {
    await check(db.from("clients").update(Object.fromEntries(uniqueToMove.map((f) => [f, null]))).eq("id", otherId), "Kennungen lösen")
  }
  if (Object.keys(patch).length > 0) await check(db.from("clients").update(patch).eq("id", keepId), "Kunde aktualisieren")
  await check(
    db.from("client_comments").insert({ client_id: keepId, author_id: null, kind: "system", content: `Dublette „${other.name}“ wurde mit diesem Kunden zusammengeführt.` }),
    "Kommentar"
  )
  await check(db.from("clients").delete().eq("id", otherId), "Dublette löschen")
}

// Löschen eines Datensatzes aus einem Dublettenfall (der andere bleibt unverändert).
export async function deleteDuplicateRecord(db: SupabaseClient, kind: "kunde" | "kandidat", id: string): Promise<void> {
  if (kind === "kandidat") {
    await check(db.from("candidates").delete().eq("id", id), "Kandidat löschen")
    return
  }
  // Kunde: abhängige Kanzlei-Kampagnen und Zuordnungen zuerst (keine Kaskade dort).
  await check(db.from("client_assignments").delete().eq("client_id", id), "Zuordnungen")
  const { data: campaigns } = await db.from("campaigns").select("id").eq("client_id", id)
  const campaignIds = (campaigns ?? []).map((c) => c.id as string)
  if (campaignIds.length > 0) {
    // Kandidaten behalten, nur den Verweis auf die Herkunfts-Kampagne lösen.
    await check(db.from("candidates").update({ campaign_id: null }).in("campaign_id", campaignIds), "Kandidaten-Herkunft")
    await check(db.from("campaign_automations").delete().in("campaign_id", campaignIds), "Automationen")
  }
  await check(db.from("campaigns").delete().eq("client_id", id), "Kampagnen")
  await check(db.from("clients").delete().eq("id", id), "Kunde löschen")
}
