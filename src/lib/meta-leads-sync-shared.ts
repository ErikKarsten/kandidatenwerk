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

export type SupabaseClient = GenericSupabaseClient<Database>

export const META_FALLBACK_CANDIDATE_STATUS = "neu"

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
    return { status: "linked_existing", candidateId: existingByEmail.id }
  }

  // 3. Neuer Kandidat: Name bereinigen (gleiche Heuristik wie beim Leadtable-Import),
  // Berufsbild aus dem Kampagnentitel ableiten, Zusatzfelder per KI aus den rohen
  // Meta-Formular-Antworten befüllen (record dient hier als modifiedData-Ersatz).
  const { firstName, lastName, usedLongNameHeuristic } = extractCleanName(name ?? "")
  const berufsbild = mapKanzleistelleBerufsbild(campaign.title)

  const aiResult = await extractCustomFieldsFromDescriptionAI(null, record, {})
  if (aiResult.error) {
    console.warn(`  [KI-Warnung] Lead ${lead.id}: ${aiResult.error}`)
  }

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
      source: "meta",
      campaign_id: campaign.id,
      client_id: campaign.client_id,
      meta_lead_id: lead.id,
      custom_fields: aiResult.fields as Json,
      notes: `${notePrefix}Import direkt aus Meta, Kampagne "${campaign.title}"`,
    })
    .select("id")
    .single()
  if (insertError) throw new Error(insertError.message)

  return { status: "created", candidateId: inserted.id }
}
