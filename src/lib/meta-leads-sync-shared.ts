// Gemeinsame Verarbeitungslogik für einen einzelnen Meta-Lead - genutzt sowohl vom
// periodischen Batch-Sync (scripts/meta-leads-sync.ts, alle 30 Min. per GitHub Action)
// als auch vom Echtzeit-Webhook (src/app/api/webhooks/meta-leadgen/route.ts), der einen
// einzelnen Lead sofort verarbeitet, sobald er bei Meta eingeht. Aus meta-leads-sync.ts
// ausgelagert, damit beide Wege exakt dieselbe Dublettenschutz-/Anlage-Logik nutzen,
// statt sie zweimal zu pflegen.
import type { SupabaseClient as GenericSupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/types/database"
import { extractMetaContactFields, type MetaLead } from "@/lib/meta-ads-client"
import { extractCustomFieldsFromDescriptionAI } from "@/lib/leadtable-sync-shared"
import { extractCleanName } from "@/lib/leadtable-import"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { FIXED_CUSTOM_FIELD_KEYS } from "@/lib/candidate-custom-fields"
import { ensureClientAssignment } from "@/lib/client-assignment"

export type SupabaseClient = GenericSupabaseClient<Database>

export const META_FALLBACK_CANDIDATE_STATUS = "neu"

// Meta generiert die Feld-Keys eines Lead-Formulars automatisch aus dem Fragetext
// (siehe Live-Verifikation vom 16.09.2026, field_data eines echten Testleads) - anders
// als bei Leadtable (feste, opake question-IDs wie q_gy0zcd) sind sie hier also selbst-
// sprechend, aber genau deshalb auch NICHT stabil: ändert sich der Fragetext in einem
// künftigen Formular (andere Formulierung, andere Sprache), ändert sich auch der Key,
// und diese feste Zuordnung greift dann nicht mehr für dieses Formular. Für unbekannte
// Keys springt weiterhin die KI-Extraktion (extractCustomFieldsFromDescriptionAI) ein -
// bei einem neuen Formular mit anders formulierten Fragen hier einfach ergänzen, sobald
// die tatsächlichen Feld-Keys bekannt sind (z.B. wieder per Live-Testlead prüfen).
export const META_CUSTOM_FIELD_MAP: Record<string, string> = {
  "welche_ausbildung_hast_du_absolviert?": "ausbildung",
  "wann_bist_du_am_besten_telefonisch_erreichbar?": "erreichbarkeit",
}

// Direkte, KI-freie Zuordnung für die oben bekannten Meta-Feld-Keys - Pendant zu
// extractLeadtableCustomFields. Übernimmt einen Wert nur, wenn der zugeordnete
// FIXED_CUSTOM_FIELDS-Key auch tatsächlich existiert (Tippfehler-Schutz) und der Wert
// nicht leer ist.
export function extractMetaCustomFields(record: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const [metaKey, fieldName] of Object.entries(META_CUSTOM_FIELD_MAP)) {
    if (!FIXED_CUSTOM_FIELD_KEYS.has(fieldName)) continue
    const value = record[metaKey]
    if (typeof value === "string" && value.trim() !== "") {
      fields[fieldName] = value.trim()
    }
  }
  return fields
}

export interface MetaSyncCampaign {
  id: string
  title: string
  client_id: string | null
}

export type ProcessMetaLeadOutcome =
  | { status: "created"; candidateId: string }
  | { status: "linked_existing"; candidateId: string }
  | { status: "skipped_no_email" }
  | { status: "already_known" }

// Verarbeitet EINEN Meta-Lead für eine Kampagne (Dublettenschutz per meta_lead_id, dann
// per E-Mail, sonst neuer Kandidat mit KI-Zusatzfelder-Extraktion) - siehe
// scripts/meta-leads-sync.ts für den ursprünglichen Kontext/die Kommentare dazu. Wirft
// bei DB-/KI-Fehlern, statt sie zu schlucken - der Aufrufer (Batch-Sync oder Webhook)
// entscheidet, wie er damit umgeht.
export async function processMetaLead(
  supabase: SupabaseClient,
  campaign: MetaSyncCampaign,
  lead: MetaLead
): Promise<ProcessMetaLeadOutcome> {
  // 1. Bereits per meta_lead_id bekannt (z.B. wiederholter Lauf, oder Webhook UND
  // Batch-Sync erwischen denselben Lead) -> überspringen.
  const { data: existingByMetaId, error: metaIdLookupError } = await supabase
    .from("candidates")
    .select("id")
    .eq("meta_lead_id", lead.id)
    .maybeSingle()
  if (metaIdLookupError) throw new Error(metaIdLookupError.message)
  if (existingByMetaId) return { status: "already_known" }

  const { name, email, phone, record } = extractMetaContactFields(lead.field_data)

  if (!email) return { status: "skipped_no_email" }

  // 2. Per E-Mail bekannt (z.B. schon von Leadtable importiert) -> keinen zweiten
  // Kandidaten anlegen, sondern nur die meta_lead_id nachtragen, damit künftige Läufe
  // diesen Lead direkt per ID erkennen statt jedes Mal erneut per E-Mail zu suchen.
  const { data: existingByEmail, error: emailLookupError } = await supabase
    .from("candidates")
    .select("id, meta_lead_id")
    .eq("email", email)
    .maybeSingle()
  if (emailLookupError) throw new Error(emailLookupError.message)

  if (existingByEmail) {
    if (!existingByEmail.meta_lead_id) {
      const { error: linkError } = await supabase
        .from("candidates")
        .update({ meta_lead_id: lead.id })
        .eq("id", existingByEmail.id)
      if (linkError) throw new Error(linkError.message)
    }

    // Bewirbt sich ein schon bekannter Kandidat ueber eine ANDERE Kampagne (z.B. eine
    // zweite Anzeige einer anderen Kanzlei), soll diese neue Kanzlei ihn ebenfalls
    // sehen koennen - ueber dieselbe Mehrfachzuordnung wie bei der manuellen Zuordnung
    // (client_assignments, siehe assignToClientAction in
    // dashboard/candidates/[id]/actions.ts, seit 20260902000000 ohne
    // Unique-Beschraenkung mehr auf eine aktive Zuordnung pro Kandidat). ensureClientAssignment
    // legt nur an, wenn noch keine AKTIVE Zuordnung zu dieser Kanzlei besteht, sonst wuerden
    // wiederholte Leads/Sync-Laeufe die Zuordnungsliste unnoetig aufblaehen - die History-
    // Notiz braucht also ebenfalls die vorherige Existenzprüfung, um nicht bei jedem Lauf
    // erneut zu schreiben.
    if (campaign.client_id) {
      const { data: existingAssignment } = await supabase
        .from("client_assignments")
        .select("id")
        .eq("candidate_id", existingByEmail.id)
        .eq("client_id", campaign.client_id)
        .is("removed_at", null)
        .maybeSingle()

      if (!existingAssignment) {
        await ensureClientAssignment(supabase, existingByEmail.id, campaign.client_id)

        await supabase.from("candidate_history").insert({
          candidate_id: existingByEmail.id,
          type: "note",
          content: `Erneut ueber Meta beworben, Kampagne "${campaign.title}" - neue Kanzlei-Zuordnung ergaenzt.`,
        })
      }
    }

    return { status: "linked_existing", candidateId: existingByEmail.id }
  }

  // 3. Neuer Kandidat: Name bereinigen (gleiche Heuristik wie beim Leadtable-Import),
  // Zusatzfelder per KI aus den rohen Meta-Formular-Antworten befüllen (record dient
  // hier als modifiedData-Ersatz).
  const { firstName, lastName, usedLongNameHeuristic } = extractCleanName(name ?? "")

  const aiResult = await extractCustomFieldsFromDescriptionAI(null, record, {})
  if (aiResult.error) {
    console.warn(`  [KI-Warnung] Lead ${lead.id}: ${aiResult.error}`)
  }
  // Direkt zugeordnete Werte (bekannte Meta-Feld-Keys, siehe META_CUSTOM_FIELD_MAP)
  // haben Vorrang vor der KI-Vermutung - deshalb NACH aiResult.fields gespreadet, damit
  // sie eine unsichere KI-Zuordnung überschreiben. Funktioniert auch, wenn die
  // KI-Extraktion komplett fehlschlägt (aiResult.fields ist dann nur {}).
  const customFields = { ...aiResult.fields, ...extractMetaCustomFields(record) }

  // Berufsbild: zuerst aus der eigenen Ausbildungsantwort des Kandidaten ableiten
  // (verlässlicher als der Kampagnentitel - siehe Diagnose 21.09.2026: vorher wurde
  // IMMER der Kampagnentitel genutzt, unabhängig davon, was der Kandidat selbst als
  // Ausbildung angegeben hat). Fallback auf den Kampagnentitel, wenn keine
  // Ausbildungsantwort vorliegt oder sie sich keinem der vier Berufsbilder zuordnen lässt.
  const berufsbild =
    (customFields.ausbildung && mapKanzleistelleBerufsbild(customFields.ausbildung)) ||
    mapKanzleistelleBerufsbild(campaign.title)

  const notePrefix = usedLongNameHeuristic ? "[Automatisch bereinigter Name, bitte prüfen] " : ""

  const { data: inserted, error: insertError } = await supabase
    .from("candidates")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone ?? null,
      berufsbild,
      plz: null,
      status: META_FALLBACK_CANDIDATE_STATUS,
      source: "meta_ads",
      campaign_id: campaign.id,
      client_id: campaign.client_id,
      meta_lead_id: lead.id,
      custom_fields: customFields as Json,
      notes: `${notePrefix}Import direkt aus Meta, Kampagne "${campaign.title}"`,
    })
    .select("id")
    .single()
  if (insertError) throw new Error(insertError.message)

  if (campaign.client_id) {
    try {
      await ensureClientAssignment(supabase, inserted.id, campaign.client_id)
    } catch (assignmentError) {
      console.error(`Kunden-Zuordnung fehlgeschlagen für Kandidat ${inserted.id}:`, assignmentError)
    }
  }

  return { status: "created", candidateId: inserted.id }
}
