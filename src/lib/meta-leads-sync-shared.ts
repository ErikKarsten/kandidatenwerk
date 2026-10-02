// Gemeinsame Verarbeitungslogik für einen einzelnen Meta-Lead - genutzt sowohl vom
// periodischen Batch-Sync (scripts/meta-leads-sync.ts, alle 30 Min. per GitHub Action)
// als auch vom Echtzeit-Webhook (src/app/api/webhooks/meta-leadgen/route.ts), der einen
// einzelnen Lead sofort verarbeitet, sobald er bei Meta eingeht. Aus meta-leads-sync.ts
// ausgelagert, damit beide Wege exakt dieselbe Dublettenschutz-/Anlage-Logik nutzen,
// statt sie zweimal zu pflegen.
import type { SupabaseClient as GenericSupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/types/database"
import { extractMetaContactFields, type MetaLead } from "@/lib/meta-ads-client"
import { extractCleanName } from "@/lib/leadtable-import"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { applyFormMapping, loadFormQuestions, rememberFormKeys, resolvePlzFromAnswer } from "@/lib/lead-form-mapping"
import { nearestPlz } from "@/lib/geocode-plz"
import { ensureClientAssignment } from "@/lib/client-assignment"
import { notifyLeadRecipients } from "@/lib/lead-notifications"

export type SupabaseClient = GenericSupabaseClient<Database>

const NOTIFY_MAX_LEAD_AGE_MS = 48 * 60 * 60 * 1000

export const META_FALLBACK_CANDIDATE_STATUS = "neu"

export interface MetaSyncCampaign {
  id: string
  title: string
  client_id: string | null
  // Bei Lead-Kampagnen (kind = 'lead', ohne Kunde) kommt die Agentur von hier (T-36).
  agency_id?: string | null
  // Formular, über das der Lead kam - bestimmt die Feld-Zuordnung (meta_lead_forms).
  meta_form_id?: string | null
}

export type ProcessMetaLeadOutcome =
  | { status: "created"; candidateId: string }
  | { status: "linked_existing"; candidateId: string }
  | { status: "skipped_no_email" }
  | { status: "already_known" }

// Verarbeitet EINEN Meta-Lead für eine Kampagne (Dublettenschutz per meta_lead_id, dann
// per E-Mail, sonst neuer Kandidat mit Feld-Zuordnung des Formulars) - siehe
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

  const { name: fallbackName, email: fallbackEmail, phone: fallbackPhone, record } = extractMetaContactFields(lead.field_data)

  // Feld-Zuordnung des Formulars (Einstellungen -> Lead-Formulare, Paket 8). Unbekannte
  // Formulare/Fragen werden mit Vorschlägen vorgemerkt.
  let agencyId: string | null = campaign.agency_id ?? null
  if (!agencyId && campaign.client_id) {
    const { data: clientRow } = await supabase.from("clients").select("agency_id").eq("id", campaign.client_id).maybeSingle()
    agencyId = clientRow?.agency_id ?? null
  }
  const db = supabase as unknown as GenericSupabaseClient
  const { data: fieldRows } = agencyId
    ? await supabase.from("custom_field_definitions").select("key").eq("agency_id", agencyId).eq("active", true)
    : { data: [] }
  const fieldKeys = new Set((fieldRows ?? []).map((f) => f.key))
  const questions = campaign.meta_form_id ? await loadFormQuestions(db, campaign.meta_form_id) : null
  if (campaign.meta_form_id && agencyId) {
    try {
      await rememberFormKeys(db, agencyId, campaign.meta_form_id, Object.keys(record), fieldKeys)
    } catch (err) {
      console.error(`Formularfragen konnten nicht vorgemerkt werden (${campaign.meta_form_id}):`, err)
    }
  }
  const mapped = applyFormMapping(questions ?? [], record, fieldKeys)

  const email =
    mapped.email ?? fallbackEmail?.toLowerCase() ?? Object.values(record).find((v) => /^\S+@\S+\.\S+$/.test(v.trim()))?.trim().toLowerCase() ?? null
  const phone = mapped.phone ?? fallbackPhone
  const name = mapped.fullName ?? ([mapped.firstName, mapped.lastName].filter(Boolean).join(" ") || fallbackName)

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
    // (client_assignments, siehe ensureClientAssignment in
    // src/lib/client-assignment.ts, seit 20260902000000 ohne
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
  // Zusatzfelder/Beschreibung aus der Formular-Zuordnung.
  const { firstName, lastName, usedLongNameHeuristic } =
    mapped.firstName || mapped.lastName
      ? { firstName: mapped.firstName ?? "", lastName: mapped.lastName ?? "", usedLongNameHeuristic: false }
      : extractCleanName(name ?? "")
  const customFields = mapped.fields

  // Berufsbild: eigene Angabe (Berufsbild-/Ausbildungsfrage) vor Kampagnentitel.
  const berufsbild =
    (mapped.berufsbildAnswer && mapKanzleistelleBerufsbild(mapped.berufsbildAnswer)) ||
    (customFields.ausbildung && mapKanzleistelleBerufsbild(customFields.ausbildung)) ||
    mapKanzleistelleBerufsbild(campaign.title)

  // PLZ (wichtigstes Feld fürs Matching): aus der Wohnort-Antwort, sonst geschätzt aus
  // dem Werbegebiet der Kampagne.
  let location: { plz: string; lat: number; lng: number } | null = null
  let locationNote = ""
  if (mapped.plzAnswer) {
    const resolved = await resolvePlzFromAnswer(mapped.plzAnswer)
    if (resolved) {
      location = resolved
      if (resolved.fromPlace) locationNote = `PLZ aus Wohnort „${mapped.plzAnswer}“ ermittelt.`
    }
  }
  if (!location) {
    const { data: area } = await db
      .from("campaign_ad_areas")
      .select("lat, lng")
      .eq("campaign_id", campaign.id)
      .not("lat", "is", null)
      .order("adset_active", { ascending: false })
      .limit(1)
      .maybeSingle()
    const plz = area ? nearestPlz(area.lat, area.lng) : null
    if (area && plz) {
      location = { plz, lat: area.lat, lng: area.lng }
      locationNote = "PLZ geschätzt (kein Wohnort angegeben): Werbegebiet der Meta-Kampagne."
    }
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
      plz: location?.plz ?? null,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      status: META_FALLBACK_CANDIDATE_STATUS,
      source: "meta_ads",
      campaign_id: campaign.id,
      client_id: campaign.client_id,
      meta_lead_id: lead.id,
      custom_fields: customFields as Json,
      notes: [
        mapped.descriptionLines.join("\n"),
        `${notePrefix}Import direkt aus Meta, Kampagne "${campaign.title}"`,
        locationNote,
      ]
        .filter(Boolean)
        .join("\n\n"),
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

  // Nur frische Leads melden: Wird ein Formular neu verknüpft (z.B. durch den
  // Meta-Kampagnen-Abgleich, Atlas T-38), holt der Sync auch dessen alte Leads - dafür
  // keine "Neuer Lead"-Mail, sonst gäbe es eine Mail-Flut ans Team.
  const leadAgeMs = Date.now() - new Date(lead.created_time).getTime()
  if (Number.isFinite(leadAgeMs) && leadAgeMs <= NOTIFY_MAX_LEAD_AGE_MS) {
    try {
      await notifyLeadRecipients(inserted.id, `${firstName} ${lastName}`.trim())
    } catch (notifyError) {
      console.error(`Lead-Benachrichtigung fehlgeschlagen für Kandidat ${inserted.id}:`, notifyError)
    }
  }

  return { status: "created", candidateId: inserted.id }
}
