// Zuordnung der Fragen eines Meta-Lead-Formulars zu Kandidatenfeldern (Paket 8,
// 02.10.2026). Je Formular (meta_lead_forms) und Frage ein Ziel; gepflegt in
// Einstellungen -> Lead-Formulare. Neue Fragen bekommen einen automatischen Vorschlag
// (Fragetyp, sonst Stichwort-Regeln aus leadtable-form-answers.ts); Antworten ohne
// passendes Feld landen in der Beschreibung (candidates.notes).
import type { SupabaseClient } from "@supabase/supabase-js"
import { suggestForTitle, normalizeTitle } from "@/lib/leadtable-form-answers"
import { geocodePlz, nearestPlz } from "@/lib/geocode-plz"
import { forwardGeocode } from "@/lib/forward-geocode"
import { placeQueryFromAnswer } from "@/lib/place-query"
import { buildFormToPageAccessTokenMap, metaGraphFetch } from "@/lib/meta-ads-client"

export { CORE_TARGETS, SPECIAL_TARGETS } from "@/lib/lead-form-targets"

export interface FormQuestion {
  key: string
  label: string
  type: string
  target: string
}

const TYPE_TARGETS: Record<string, string> = {
  FULL_NAME: "full_name",
  FIRST_NAME: "first_name",
  LAST_NAME: "last_name",
  EMAIL: "email",
  PHONE: "phone",
  ZIP: "plz",
  POST_CODE: "plz",
  CITY: "plz",
}

// Vorschlag für eine (neue) Frage. fieldKeys: aktive Zusatzfeld-Keys der Agentur.
export function suggestTarget(question: { key: string; label?: string | null; type?: string | null }, fieldKeys: Set<string>): string {
  const byType = question.type ? TYPE_TARGETS[question.type] : undefined
  if (byType) return byType
  const title = question.label || question.key
  const suggestion = suggestForTitle(title)
  if (!suggestion) return "beschreibung"
  if (suggestion.kind === "ignorieren") return "ignorieren"
  if (suggestion.kind !== "fields") {
    const norm = normalizeTitle(title)
    if (/mail/.test(norm)) return "email"
    if (/telefon|phone|handy|mobil/.test(norm)) return "phone"
    if (/^(dein |ihr )?vorname/.test(norm)) return "first_name"
    if (/nachname/.test(norm) && !/vor/.test(norm)) return "last_name"
    return "full_name"
  }
  if (suggestion.keys.includes("wohnort_plz")) return "plz"
  const key = suggestion.keys.find((k) => fieldKeys.has(k))
  return key ? `field:${key}` : "beschreibung"
}

export interface MappedLead {
  fullName: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  plzAnswer: string | null
  berufsbildAnswer: string | null
  fields: Record<string, string>
  descriptionLines: string[]
}

// Wendet die Zuordnung auf die Antworten eines Leads an (record: Frage-Key -> Antwort).
// Fragen, die im Formular (noch) nicht bekannt sind, bekommen den Vorschlag.
export function applyFormMapping(questions: FormQuestion[], record: Record<string, string>, fieldKeys: Set<string>): MappedLead {
  const byKey = new Map(questions.map((q) => [q.key, q]))
  const result: MappedLead = {
    fullName: null,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    plzAnswer: null,
    berufsbildAnswer: null,
    fields: {},
    descriptionLines: [],
  }
  for (const [key, rawValue] of Object.entries(record)) {
    const value = rawValue.trim()
    if (!value) continue
    const question = byKey.get(key)
    const target = question?.target ?? suggestTarget({ key }, fieldKeys)
    const label = question?.label || key.replace(/_/g, " ")
    switch (target) {
      case "full_name":
        result.fullName ??= value
        break
      case "first_name":
        result.firstName ??= value
        break
      case "last_name":
        result.lastName ??= value
        break
      case "email":
        result.email ??= value.toLowerCase()
        break
      case "phone":
        result.phone ??= value
        break
      case "plz":
        result.plzAnswer ??= value
        if (fieldKeys.has("wohnort_plz")) result.fields.wohnort_plz ??= value
        break
      case "berufsbild":
        result.berufsbildAnswer ??= value
        break
      case "ignorieren":
        break
      default:
        if (target.startsWith("field:") && fieldKeys.has(target.slice(6))) {
          // Meta-Auswahlwerte kommen als "0-2_jahre".
          result.fields[target.slice(6)] = !/\s/.test(value) && value.includes("_") ? value.replace(/_/g, " ") : value
        } else {
          result.descriptionLines.push(`${label}: ${value}`)
        }
    }
  }
  return result
}

// PLZ aus einer Wohnort-Antwort: direkt, wenn eine PLZ drinsteht, sonst über die
// Ortssuche (eine Nominatim-Anfrage) und die nächstgelegene PLZ.
export async function resolvePlzFromAnswer(answer: string): Promise<{ plz: string; lat: number; lng: number; fromPlace: boolean } | null> {
  const plz = answer.match(/\b\d{5}\b/)?.[0]
  const coords = plz ? geocodePlz(plz) : null
  if (plz && coords) return { plz, ...coords, fromPlace: false }
  const query = placeQueryFromAnswer(answer)
  if (!query) return null
  const hit = await forwardGeocode(`${query}, Deutschland`).catch(() => null)
  const nearest = hit ? nearestPlz(hit.lat, hit.lng) : null
  return hit && nearest ? { plz: nearest, lat: hit.lat, lng: hit.lng, fromPlace: true } : null
}

type Db = SupabaseClient

export async function loadFormQuestions(db: Db, formId: string): Promise<FormQuestion[] | null> {
  const { data } = await db.from("meta_lead_forms").select("questions").eq("form_id", formId).maybeSingle()
  return (data?.questions as FormQuestion[] | undefined) ?? null
}

// Formular erstmals sehen (z.B. Lead eines noch nicht eingelesenen Formulars): aus den
// Antwort-Keys mit Vorschlägen anlegen bzw. neue Keys ergänzen. Beschriftungen kommen
// beim nächsten Einlesen von Meta (syncMetaLeadForms).
export async function rememberFormKeys(db: Db, agencyId: string, formId: string, keys: string[], fieldKeys: Set<string>): Promise<void> {
  const existing = await loadFormQuestions(db, formId)
  const known = new Set((existing ?? []).map((q) => q.key))
  const added = keys.filter((k) => !known.has(k)).map((key) => ({ key, label: key.replace(/_/g, " "), type: "UNBEKANNT", target: suggestTarget({ key }, fieldKeys) }))
  if (existing && added.length === 0) return
  await db
    .from("meta_lead_forms")
    .upsert({ form_id: formId, agency_id: agencyId, questions: [...(existing ?? []), ...added], synced_at: new Date().toISOString() }, { onConflict: "form_id" })
}

export interface SyncLeadFormsResult {
  forms: number
  added: number
  newQuestions: number
  errors: string[]
}

// Liest die Formulare (Name, Seite, Fragen) bei Meta ein. Bestehende Zuordnungen bleiben
// erhalten, neue Fragen bekommen einen Vorschlag. onlyMissing: nur noch unbekannte
// Formulare (für den stündlichen Abgleich - spart Meta-Anfragen).
export async function syncMetaLeadForms(
  db: Db,
  agencyId: string,
  formIds: string[],
  fieldKeys: Set<string>,
  { onlyMissing = false }: { onlyMissing?: boolean } = {}
): Promise<SyncLeadFormsResult> {
  const result: SyncLeadFormsResult = { forms: 0, added: 0, newQuestions: 0, errors: [] }
  const { data: rows } = await db.from("meta_lead_forms").select("form_id, name, questions")
  const rowById = new Map((rows ?? []).map((r) => [r.form_id as string, r]))
  const targets = [...new Set(formIds)].filter((id) => !onlyMissing || !rowById.get(id)?.name)
  if (targets.length === 0) return result

  // Formulare gehören zu Seiten - Fragen gibt es nur mit dem Seiten-Token.
  const tokens = await buildFormToPageAccessTokenMap()
  for (const formId of targets) {
    const token = tokens.get(formId)
    if (!token) {
      result.errors.push(`Formular ${formId}: Seite ist dem Meta-Systemnutzer nicht freigegeben.`)
      continue
    }
    try {
      const form = await metaGraphFetch<{ name?: string; page?: { name?: string }; questions?: { key: string; label?: string; type?: string }[] }>(
        `/${formId}`,
        { fields: "name,questions,page{name}" },
        token
      )
      const existing = new Map(((rowById.get(formId)?.questions as FormQuestion[] | undefined) ?? []).map((q) => [q.key, q]))
      const questions: FormQuestion[] = (form.questions ?? []).map((q) => {
        const prev = existing.get(q.key)
        if (!prev) result.newQuestions++
        return { key: q.key, label: q.label ?? q.key, type: q.type ?? "CUSTOM", target: prev?.target ?? suggestTarget(q, fieldKeys) }
      })
      // Nur aus Leads bekannte Keys (nicht mehr im Formular) behalten.
      for (const prev of existing.values()) if (!questions.some((q) => q.key === prev.key)) questions.push(prev)
      const { error } = await db.from("meta_lead_forms").upsert(
        {
          form_id: formId,
          agency_id: agencyId,
          name: form.name ?? null,
          page_name: form.page?.name ?? null,
          questions,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "form_id" }
      )
      if (error) throw new Error(error.message)
      result.forms++
      if (!rowById.has(formId)) result.added++
    } catch (err) {
      result.errors.push(`Formular ${formId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return result
}
