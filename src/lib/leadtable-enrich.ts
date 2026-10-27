// Leads aus dem eigenen Meta-Formular einer Kanzlei (Paket 93): Viele stehen auch in
// Leadtable (das Formular war dort angebunden, das Team hat dort schon telefoniert).
// Status, Notizen und Zusatzfelder aus Leadtable übernehmen - nur dort, wo in
// Kandidatenwerk noch nichts steht: Status nur von "neu" aus, Notizen nur bei leerer
// Beschreibung, Zusatzfelder nur leere. Genutzt beim Meta-Import (processMetaLead) und
// einmalig für bestehende Leads. Bewusst ohne Zuordnung an die Kanzlei: ein in Leadtable
// "Vorqualifiziert"er Lead kann die Kanzlei schon auf anderem Weg erreicht haben.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/types/database"
import { leadtableFetch } from "@/lib/leadtable-client"
import {
  extractCustomFieldsFromDescriptionAI,
  extractLeadtableCustomFields,
  findLeadByEmailWithFallback,
  htmlDescriptionToPlainText,
  leadtableStatusName,
  mapLeadtableStatus,
  withRetry,
  type LeadtableSyncLead,
} from "@/lib/leadtable-sync-shared"
import type { CustomFieldDefinitionLite } from "@/lib/custom-field-definitions"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

type Db = SupabaseClient<Database>

export function leadtableConfigured(): boolean {
  return !!process.env.LEADTABLE_API_KEY && !!process.env.LEADTABLE_ACCOUNT_EMAIL
}

export interface LeadtableEnrichResult {
  found: boolean
  leadtableStatus?: string
  // Neuer Status in Kandidatenwerk, falls übernommen.
  status?: string
  description: boolean
  fields: string[]
}

const statusLabel = (value: string) => CANDIDATE_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value

// Text für den Verlauf, z. B. "Aus Leadtable übernommen: Status „Absage“ → Abgelehnt, Notizen, Zusatzfelder (Ausbildung)".
export function leadtableEnrichNote(result: LeadtableEnrichResult, fieldLabels: Record<string, string> = {}): string | null {
  const parts: string[] = []
  if (result.status) parts.push(`Status „${result.leadtableStatus}“ → ${statusLabel(result.status)}`)
  if (result.description) parts.push("Notizen")
  if (result.fields.length > 0) parts.push(`Zusatzfelder (${result.fields.map((k) => fieldLabels[k] ?? k).join(", ")})`)
  return parts.length > 0 ? `Aus Leadtable übernommen: ${parts.join(", ")}.` : null
}

export async function enrichCandidateFromLeadtable(
  db: Db,
  candidateId: string,
  // Mit fieldDefinitions zusätzlich KI-Zuordnung der Notizen zu den Zusatzfeldern (dauert
  // einige Sekunden, deshalb nicht im Webhook).
  opts: { fieldDefinitions?: CustomFieldDefinitionLite[]; fieldLabels?: Record<string, string>; createdBy?: string | null } = {}
): Promise<LeadtableEnrichResult> {
  const { data: candidate, error } = await db
    .from("candidates")
    .select("id, email, status, description, custom_fields, leadtable_lead_id")
    .eq("id", candidateId)
    .single()
  if (error) throw new Error(error.message)
  const email = (candidate.email ?? "").trim().split(/\s+/)[0]
  const leadId = candidate.leadtable_lead_id ?? (email ? (await findLeadByEmailWithFallback(email))?._id : undefined)
  if (!leadId) return { found: false, description: false, fields: [] }

  const { lead } = await withRetry(() => leadtableFetch<{ lead: LeadtableSyncLead }>(`/lead/${leadId}`))
  const patch: { leadtable_lead_id?: string; status?: string; description?: string; custom_fields?: Json } = {}
  const result: LeadtableEnrichResult = { found: true, leadtableStatus: leadtableStatusName(lead), description: false, fields: [] }

  // leadtable_lead_id ist eindeutig - steht der Lead schon an einem anderen Kandidaten
  // (Dublette), bleibt die Kennung dort.
  if (!candidate.leadtable_lead_id) {
    const { data: taken } = await db.from("candidates").select("id").eq("leadtable_lead_id", leadId).neq("id", candidateId).maybeSingle()
    if (!taken) patch.leadtable_lead_id = leadId
  }

  const mapped = mapLeadtableStatus(lead)
  if (candidate.status === "neu" && mapped && mapped !== "neu") {
    patch.status = mapped
    result.status = mapped
  }

  let description = (candidate.description ?? "").trim()
  if (!description) {
    const fromLeadtable = htmlDescriptionToPlainText(lead.description ?? "")
    if (fromLeadtable) {
      patch.description = fromLeadtable
      description = fromLeadtable
      result.description = true
    }
  }

  const existing = (candidate.custom_fields as Record<string, string> | null) ?? {}
  const added: Record<string, string> = {}
  for (const [key, value] of Object.entries(extractLeadtableCustomFields(lead.modifiedData).fields)) {
    if (!existing[key]?.trim()) added[key] = value
  }
  if (opts.fieldDefinitions?.length) {
    const ai = await extractCustomFieldsFromDescriptionAI(description, lead.modifiedData, { ...existing, ...added }, opts.fieldDefinitions)
    for (const [key, value] of Object.entries(ai.fields)) if (!existing[key]?.trim() && !added[key]) added[key] = value
  }
  if (Object.keys(added).length > 0) {
    patch.custom_fields = { ...added, ...existing } as Json
    result.fields = Object.keys(added)
  }

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await db.from("candidates").update(patch).eq("id", candidateId)
    if (updateError) throw new Error(updateError.message)
  }
  const labels = { ...opts.fieldLabels, ...Object.fromEntries((opts.fieldDefinitions ?? []).map((f) => [f.key, f.label])) }
  const note = leadtableEnrichNote(result, labels)
  if (note) {
    await db.from("candidate_history").insert({
      candidate_id: candidateId,
      type: result.status ? "status_change" : "note",
      content: note,
      ...(opts.createdBy ? { created_by: opts.createdBy } : {}),
    })
  }
  return result
}
