// Automatisierungs-Vorlagen und Vorlagensets (Paket 15, T-74). Eine Vorlage ist eine
// komplette Automatisierung; übernommen wird sie als Kopie in campaign_automations
// (template_id merkt sich die Herkunft, damit dieselbe Vorlage nicht doppelt landet).
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

export const AUTOMATION_TRIGGER_OPTIONS = [
  { value: "new_lead", label: "Neuer Lead" },
  { value: "status_change", label: "Statusänderung" },
  // Kanzlei-Kampagnen: sobald der Kampagne ein Kandidat zugeordnet wird (Paket 21) - z.B.
  // "Neuer Kandidat für Sie" mit #Bewerberlink an die Portal-Zugänge der Kanzlei.
  { value: "client_assigned", label: "Kandidat der Kampagne zugeordnet" },
  // Nur im Reiter "Kommunikation" beim Kandidaten nutzbar, nie automatisch (Paket 19, T-88).
  { value: "manual", label: "Nur manuell (Kommunikation)" },
]

// Auslöser, die in Kampagnen als Automatisierung laufen.
export function isCampaignTrigger(trigger: string): boolean {
  return trigger === "new_lead" || trigger === "status_change" || trigger === "client_assigned"
}
export const CAMPAIGN_TRIGGER_OPTIONS = AUTOMATION_TRIGGER_OPTIONS.filter((o) => isCampaignTrigger(o.value))

// Bis 1 Minute wird beim Ereignis sofort verschickt (Paket 22), längere Verzögerungen über
// den 5-Minuten-Job.
export const AUTOMATION_DELAY_OPTIONS = [
  { value: 0, label: "Sofort" },
  { value: 10, label: "10 Sekunden" },
  { value: 30, label: "30 Sekunden" },
  { value: 60, label: "1 Minute" },
  { value: 300, label: "5 Minuten" },
  { value: 3600, label: "1 Stunde" },
  { value: 86400, label: "1 Tag" },
]

export const AUTOMATION_RECIPIENT_OPTIONS = [
  { value: "candidate", label: "Kandidat" },
  { value: "client", label: "Kanzlei: alle Portal-Zugänge (ohne Zugang: Kontakt-E-Mail)" },
  { value: "all_contacts", label: "Kanzlei: alle Ansprechpartner (Stammdaten)" },
]

export const AUTOMATION_VARIABLES = ["#Kandidatenname", "#Kampagnenname", "#Kundenname", "#Email", "#Telefon", "#Bewerberlink"]

export function automationTriggerLabel(trigger: string, triggerStatus: string | null): string {
  if (trigger === "new_lead") return "Neuer Lead"
  if (trigger === "manual") return "Nur manuell (Kommunikation)"
  if (trigger === "client_assigned") return "Kandidat der Kampagne zugeordnet"
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

// "Neuer Kandidat für die Kanzlei" (Auslöser "Kandidat der Kampagne zugeordnet") ist in
// echten Kanzlei-Kampagnen gleich eingeschaltet (Entscheidung 05.11.2026). Alle anderen
// übernommenen Automatisierungen starten weiter ausgeschaltet (Entscheidung 06.10.2026).
export function startsActive(trigger: string, campaign: { kind: string; is_demo: boolean }): boolean {
  return trigger === "client_assigned" && campaign.kind === "kanzlei" && !campaign.is_demo
}

// Übernimmt Vorlagen als Automatisierungen in eine Kampagne. Bereits aus derselben
// Vorlage übernommene werden übersprungen. Liefert die Zahl neu angelegter.
export async function applyTemplatesToCampaign(db: Db, campaignId: string, templateIds: string[]): Promise<number> {
  if (templateIds.length === 0) return 0
  const [{ data: templates, error }, { data: existing }, { data: campaign }] = await Promise.all([
    db.from("automation_templates").select("*").in("id", templateIds),
    db.from("campaign_automations").select("template_id").eq("campaign_id", campaignId).not("template_id", "is", null),
    db.from("campaigns").select("kind, is_demo").eq("id", campaignId).maybeSingle(),
  ])
  if (error) throw new Error(error.message)
  const already = new Set((existing ?? []).map((e) => e.template_id))
  const now = new Date().toISOString()
  const rows = (templates ?? [])
    // Manuelle Vorlagen (Kommunikation) werden nie zu Automatisierungen.
    .filter((t) => !already.has(t.id) && isCampaignTrigger(t.trigger))
    .map((t) => {
      const active = !!campaign && startsActive(t.trigger, campaign)
      return {
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
        // Ab jetzt: keine Mail für Kandidaten, die vorher schon zugeordnet waren.
        active_since: active ? now : null,
      }
    })
  if (rows.length === 0) return 0
  const { error: insertError } = await db.from("campaign_automations").insert(rows)
  if (insertError) throw new Error(insertError.message)
  return rows.length
}

export async function templateIdsOfSet(db: Db, setId: string): Promise<string[]> {
  const { data } = await db.from("automation_template_set_items").select("template_id").eq("set_id", setId)
  return (data ?? []).map((r) => r.template_id)
}

// Neue Kampagne: Standard-Set übernehmen. "Neuer Kandidat für die Kanzlei" ist in
// Kanzlei-Kampagnen gleich an, alles andere aus (siehe startsActive).
// Fehler werden geloggt, damit die Kampagnenanlage nicht daran scheitert.
export async function applyDefaultTemplateSet(db: Db, campaignId: string): Promise<void> {
  try {
    const { data: set } = await db.from("automation_template_sets").select("id").eq("is_default", true).limit(1).maybeSingle()
    if (!set) return
    await applyTemplatesToCampaign(db, campaignId, await templateIdsOfSet(db, set.id))
  } catch (err) {
    console.error("Standard-Vorlagenset konnte nicht übernommen werden:", err instanceof Error ? err.message : err)
  }
}
