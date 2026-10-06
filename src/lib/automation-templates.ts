// Automatisierungs-Vorlagen und Vorlagensets (Paket 15, T-74). Eine Vorlage ist eine
// komplette Automatisierung; übernommen wird sie als Kopie in campaign_automations
// (template_id merkt sich die Herkunft, damit dieselbe Vorlage nicht doppelt landet).
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

export const AUTOMATION_TRIGGER_OPTIONS = [
  { value: "new_lead", label: "Neuer Lead" },
  { value: "status_change", label: "Statusänderung" },
  // Geht an die Kanzlei, sobald ihr ein Kandidat zugeordnet wird - unabhängig von Kampagnen
  // (Paket 20, T-90).
  { value: "client_assigned", label: "Kandidat einer Kanzlei zugeordnet" },
  // Nur im Reiter "Kommunikation" beim Kandidaten nutzbar, nie automatisch (Paket 19, T-88).
  { value: "manual", label: "Nur manuell (Kommunikation)" },
]

// Auslöser, die in Kampagnen als Automatisierung laufen.
export function isCampaignTrigger(trigger: string): boolean {
  return trigger === "new_lead" || trigger === "status_change"
}
export const CAMPAIGN_TRIGGER_OPTIONS = AUTOMATION_TRIGGER_OPTIONS.filter((o) => isCampaignTrigger(o.value))

export const AUTOMATION_DELAY_OPTIONS = [
  { value: 10, label: "10 Sekunden" },
  { value: 30, label: "30 Sekunden" },
  { value: 60, label: "1 Minute" },
  { value: 300, label: "5 Minuten" },
  { value: 3600, label: "1 Stunde" },
  { value: 86400, label: "1 Tag" },
]

export const AUTOMATION_RECIPIENT_OPTIONS = [
  { value: "candidate", label: "Kandidat" },
  { value: "client", label: "Kunde (primärer Ansprechpartner)" },
  { value: "all_contacts", label: "Alle Kunden-Ansprechpartner" },
]

export const AUTOMATION_VARIABLES = ["#Kandidatenname", "#Kampagnenname", "#Kundenname", "#Email", "#Telefon", "#Bewerberlink"]

export function automationTriggerLabel(trigger: string, triggerStatus: string | null): string {
  if (trigger === "new_lead") return "Neuer Lead"
  if (trigger === "manual") return "Nur manuell (Kommunikation)"
  if (trigger === "client_assigned") return "Kandidat einer Kanzlei zugeordnet"
  const status = CANDIDATE_STATUS_OPTIONS.find((s) => s.value === triggerStatus)?.label ?? triggerStatus ?? "–"
  return `Statusänderung → ${status}`
}

export function automationRecipientLabel(recipient: string): string {
  return AUTOMATION_RECIPIENT_OPTIONS.find((o) => o.value === recipient)?.label ?? recipient
}

export function automationDelayLabel(seconds: number): string {
  return AUTOMATION_DELAY_OPTIONS.find((o) => o.value === seconds)?.label ?? `${seconds} Sekunden`
}

type Db = SupabaseClient<Database>

// Übernimmt Vorlagen als Automatisierungen in eine Kampagne. Bereits aus derselben
// Vorlage übernommene werden übersprungen. Liefert die Zahl neu angelegter.
export async function applyTemplatesToCampaign(db: Db, campaignId: string, templateIds: string[], active: boolean): Promise<number> {
  if (templateIds.length === 0) return 0
  const [{ data: templates, error }, { data: existing }] = await Promise.all([
    db.from("automation_templates").select("*").in("id", templateIds),
    db.from("campaign_automations").select("template_id").eq("campaign_id", campaignId).not("template_id", "is", null),
  ])
  if (error) throw new Error(error.message)
  const already = new Set((existing ?? []).map((e) => e.template_id))
  const rows = (templates ?? [])
    // Manuelle Vorlagen (Kommunikation) werden nie zu Automatisierungen.
    .filter((t) => !already.has(t.id) && isCampaignTrigger(t.trigger))
    .map((t) => ({
      campaign_id: campaignId,
      template_id: t.id,
      name: t.name,
      trigger: t.trigger,
      trigger_status: t.trigger_status,
      delay_seconds: t.delay_seconds,
      recipient: t.recipient,
      subject: t.subject,
      body_html: t.body_html,
      active,
      active_since: active ? new Date().toISOString() : null,
    }))
  if (rows.length === 0) return 0
  const { error: insertError } = await db.from("campaign_automations").insert(rows)
  if (insertError) throw new Error(insertError.message)
  return rows.length
}

export async function templateIdsOfSet(db: Db, setId: string): Promise<string[]> {
  const { data } = await db.from("automation_template_set_items").select("template_id").eq("set_id", setId)
  return (data ?? []).map((r) => r.template_id)
}

// Neue Kampagne: Standard-Set übernehmen, ausgeschaltet (Entscheidung 06.10.2026) - es
// geht nichts raus, bis jemand die Automatisierungen in der Kampagne einschaltet.
// Fehler werden geloggt, damit die Kampagnenanlage nicht daran scheitert.
export async function applyDefaultTemplateSet(db: Db, campaignId: string): Promise<void> {
  try {
    const { data: set } = await db.from("automation_template_sets").select("id").eq("is_default", true).limit(1).maybeSingle()
    if (!set) return
    await applyTemplatesToCampaign(db, campaignId, await templateIdsOfSet(db, set.id), false)
  } catch (err) {
    console.error("Standard-Vorlagenset konnte nicht übernommen werden:", err instanceof Error ? err.message : err)
  }
}
