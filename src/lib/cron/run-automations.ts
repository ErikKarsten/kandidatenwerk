// Führt aktive Kampagnen-Automatisierungen aus (campaign_automations): prüft für
// jede aktive Automatisierung, welche Kandidaten ihre Trigger-Bedingung erfüllen
// (neuer Lead, Status seit delay_seconds erreicht oder - Kanzlei-Kampagnen - der Kampagne
// zugeordnet), verschickt die Mail über
// den bestehenden Brevo-Versand (sendEmail) und protokolliert den Versand doppelt:
// - campaign_automation_runs: Dedup, verhindert Mehrfachversand bei künftigen Läufen
// - candidate_history (type "automation"): sichtbarer Verlaufs-Eintrag beim Kandidaten
//
// Aus scripts/run-automations.ts ausgelagert (02.10.2026), damit dieselbe Logik sowohl
// vom Cloudflare Cron Trigger (custom-worker.ts -> /api/cron/run-automations, alle 5
// Minuten) als auch weiterhin manuell per CLI läuft. Vorher lief sie per GitHub-Actions-
// Cron, den GitHub in der Praxis nur alle 3-6 Stunden statt alle 5 Minuten ausgeführt
// hat. delay_seconds (10/30/60 Sek. in der UI) bleibt eine Mindestwartezeit, keine
// sekundengenaue Zusage - eine Automatisierung feuert nie zu früh, aber ggf. bis zu
// ~5 Minuten später.
//
// Keine Rückwirkung (Paket 15, T-74): Eine Automatisierung löst nur für Leads aus, die
// nach dem Einschalten (active_since) eingegangen sind, bzw. für Statuswechsel nach dem
// Einschalten. Vorher feuerte z.B. eine frisch aktivierte new_lead-Automatisierung für
// ALLE Bestandskandidaten der Kampagne - mit Vorlagensets wäre das schnell passiert.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { berufsbildLabel } from "@/lib/berufsbild"
import { fetchBerufsbilder } from "@/lib/berufsbild-db"
import {
  mailCampaignName,
  candidatePortalLink,
  substituteTemplateVars,
  resolveAutomationRecipients,
  wrapAutomationEmailHtml,
} from "@/lib/automation-engine"

type Supabase = SupabaseClient<Database>

export interface CandidateRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  status: string
  client_id: string | null
  created_at: string
  berufsbild: string | null
  tags: string[] | null
}

export interface CampaignJoin {
  id: string
  title: string
  kind: string
  client_id: string | null
  clients: { name: string } | { name: string }[] | null
}

// Automatisierungs-Mail für einen Kandidaten (Empfänger, Betreff, HTML) - im Lauf und beim
// erneuten Senden aus dem Reiter "Automatisierungen" (Paket 84) gleich aufgebaut.
export interface AutomationMailSource {
  recipient: string
  subject: string
  body_html: string
}

export async function buildAutomationMail(
  supabase: Supabase,
  automation: AutomationMailSource,
  campaign: CampaignJoin,
  candidate: CandidateRow,
  berufsbilder: Awaited<ReturnType<typeof fetchBerufsbilder>>
): Promise<{ recipients: string[]; subject: string; html: string; bodyText: string }> {
  // Kanzlei der Kampagne, wenn beim Kandidaten keine hinterlegt ist (Lead-Kampagnen ohne
  // automatische Zuordnung, Kanzlei-Kampagnen über die Zuordnung).
  const recipients = await resolveAutomationRecipients(supabase, automation.recipient, {
    email: candidate.email,
    client_id: candidate.client_id ?? campaign.client_id,
    tags: candidate.tags,
  })
  const vars = {
    Kandidatenname: `${candidate.first_name} ${candidate.last_name}`.trim(),
    Kampagnenname: mailCampaignName(campaign, berufsbildLabel(candidate.berufsbild, berufsbilder)),
    Kundenname: unwrapOne(campaign.clients)?.name ?? "",
    Email: candidate.email ?? "",
    Telefon: candidate.phone ?? "",
    Bewerberlink: candidatePortalLink(candidate.id),
  }
  const subject = substituteTemplateVars(automation.subject, vars)
  // automation.body_html ist trotz des Namens reiner Fließtext (\n\n-Absätze, siehe
  // automations-tab.tsx) - wrapAutomationEmailHtml rendert das erst beim Versand in
  // die gebrandete Kartenvorlage, der Editor selbst bleibt unverändert Klartext.
  const bodyText = substituteTemplateVars(automation.body_html, vars)
  return { recipients, subject, html: wrapAutomationEmailHtml(bodyText), bodyText }
}

export interface RunAutomationsResult {
  sent: number
  skipped: number
  errors: number
}

// Supabase liefert eine to-one-Relation üblicherweise als einzelnes Objekt, in
// bestimmten Konstellationen aber als Array (siehe gleiches Muster in
// campaigns/[id]/page.tsx bei campaign.clients) - hier robust für beide Fälle.
function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

// Zeitpunkt, seit dem jeder Kandidat in `status` steht - aus dem letzten passenden
// status_change-Verlaufseintrag (siehe updateCandidateStatusAction in
// candidates/actions.ts, Format "Status geändert: alt → neu"). Gesammelt in Paketen statt
// je Kandidat eine Abfrage (Cloudflare-Grenze von 1000 Unteranfragen pro Lauf).
async function statusReachedAtMap(supabase: Supabase, candidates: CandidateRow[], status: string): Promise<Map<string, string>> {
  const latest = new Map<string, string>()
  for (let i = 0; i < candidates.length; i += 80) {
    const { data: rows } = await supabase
      .from("candidate_history")
      .select("candidate_id, content, created_at")
      .in("candidate_id", candidates.slice(i, i + 80).map((c) => c.id))
      .eq("type", "status_change")
      .like("content", `%→ ${status}`)
    for (const r of rows ?? []) {
      const prev = latest.get(r.candidate_id)
      if (!prev || r.created_at > prev) latest.set(r.candidate_id, r.created_at)
    }
  }
  // Fallback für Kandidaten, die z.B. per Import direkt mit diesem Status angelegt
  // wurden (kein status_change-Eintrag vorhanden) - created_at als beste verfügbare
  // Näherung, statt die Automatisierung für diese Kandidaten nie feuern zu lassen.
  return new Map(candidates.map((c) => [c.id, latest.get(c.id) ?? c.created_at]))
}

// Alles, was die Prüfung der Automatisierungen braucht, für alle Kampagnen auf einmal
// (Paket 94): vorher je Automatisierung eigene Abfragen nacheinander - bei 57 aktiven
// Automatisierungen rund 150 Abfragen und 20 Sekunden je Lauf, auch ohne Versand.
export interface AutomationData {
  // Herkunft: Kandidaten, die sich über die Kampagne beworben haben (ohne Demo).
  own: Map<string, CandidateRow[]>
  // Kanzlei-Kampagnen: zugeordnete Kandidaten mit Zeitpunkt der Zuordnung.
  assigned: Map<string, Map<string, string>>
  candidates: Map<string, CandidateRow>
  // "automationId:candidateId" - schon ausgelöst oder vermerkt.
  fired: Set<string>
}

const CANDIDATE_COLUMNS = "id, first_name, last_name, email, phone, status, client_id, created_at, berufsbild, tags"
const CHUNK = 80

async function pagedRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

export async function loadAutomationData(
  supabase: Supabase,
  automations: { id: string; trigger: string; campaign: CampaignJoin }[]
): Promise<AutomationData> {
  // Herkunfts-Kandidaten brauchen nur "Neuer Lead" und "Statusänderung"; "Kandidat
  // zugeordnet" zählt allein über die Zuordnung.
  const ownCampaignIds = [...new Set(automations.filter((a) => a.trigger !== "client_assigned").map((a) => a.campaign.id))]
  const kanzleiCampaignIds = [...new Set(automations.filter((a) => a.campaign.kind === "kanzlei").map((a) => a.campaign.id))]
  const automationIds = automations.map((a) => a.id)

  const [ownRows, assignmentRows, runRows] = await Promise.all([
    Promise.all(
      chunks(ownCampaignIds).map((ids) =>
        pagedRows<CandidateRow & { campaign_id: string | null }>((from, to) =>
          supabase.from("candidates").select(`${CANDIDATE_COLUMNS}, campaign_id`).in("campaign_id", ids).eq("is_demo", false).order("id").range(from, to)
        )
      )
    ).then((parts) => parts.flat()),
    Promise.all(
      chunks(kanzleiCampaignIds).map((ids) =>
        pagedRows<{ campaign_id: string | null; candidate_id: string; created_at: string }>((from, to) =>
          supabase.from("client_assignments").select("campaign_id, candidate_id, created_at").in("campaign_id", ids).is("removed_at", null).order("id").range(from, to)
        )
      )
    ).then((parts) => parts.flat()),
    Promise.all(
      chunks(automationIds).map((ids) =>
        pagedRows<{ automation_id: string; candidate_id: string }>((from, to) =>
          supabase.from("campaign_automation_runs").select("automation_id, candidate_id").in("automation_id", ids).order("automation_id").order("candidate_id").range(from, to)
        )
      )
    ).then((parts) => parts.flat()),
  ])

  const data: AutomationData = { own: new Map(), assigned: new Map(), candidates: new Map(), fired: new Set() }
  for (const { campaign_id, ...c } of ownRows) {
    if (!campaign_id) continue
    data.own.set(campaign_id, [...(data.own.get(campaign_id) ?? []), c])
    data.candidates.set(c.id, c)
  }
  for (const a of assignmentRows) {
    if (!a.campaign_id) continue
    if (!data.assigned.has(a.campaign_id)) data.assigned.set(a.campaign_id, new Map())
    data.assigned.get(a.campaign_id)!.set(a.candidate_id, a.created_at)
  }
  for (const r of runRows) data.fired.add(`${r.automation_id}:${r.candidate_id}`)

  const missing = [...new Set(assignmentRows.map((a) => a.candidate_id))].filter((id) => !data.candidates.has(id))
  const assignedRows = await Promise.all(
    chunks(missing).map(async (ids) => {
      const { data: rows, error } = await supabase.from("candidates").select(CANDIDATE_COLUMNS).in("id", ids).eq("is_demo", false)
      if (error) throw new Error(error.message)
      return (rows ?? []) as CandidateRow[]
    })
  )
  for (const c of assignedRows.flat()) data.candidates.set(c.id, c)
  return data
}

// Kandidaten einer Kampagne: bei Lead-Kampagnen die darüber beworbenen, bei
// Kanzlei-Kampagnen zusätzlich die ihr zugeordneten (client_assignments.campaign_id) -
// vorher sahen Automatisierungen in Kanzlei-Kampagnen nie einen Kandidaten (Paket 21).
export function campaignCandidates(
  data: AutomationData,
  campaign: CampaignJoin,
  trigger: string,
  triggerStatus: string | null,
  joinedAt: Map<string, string>
): CandidateRow[] {
  const matches = (c: CandidateRow) => trigger !== "status_change" || c.status === triggerStatus
  const byId = new Map<string, CandidateRow>()
  if (trigger !== "client_assigned") for (const c of data.own.get(campaign.id) ?? []) if (matches(c)) byId.set(c.id, c)
  if (campaign.kind === "kanzlei") {
    for (const [candidateId, at] of data.assigned.get(campaign.id) ?? []) joinedAt.set(candidateId, at)
    for (const id of joinedAt.keys()) {
      const c = data.candidates.get(id)
      if (c && !byId.has(id) && matches(c)) byId.set(id, c)
    }
  }
  return [...byId.values()]
}

// dryRun: zeigt nur (über log), was verschickt würde - kein Versand, kein DB-Schreiben.
// In dem Fall stehen sent/skipped für "würde verschicken"/"würde überspringen".
// campaignIds: nur diese Kampagnen (sofortige Auslösung nach einem Ereignis, Paket 22).
// immediate: Verzögerungen bis 60 Sekunden gelten als "sofort" - der Lauf kommt ja direkt
// aus dem Ereignis; längere Verzögerungen erledigt weiter der 5-Minuten-Job.
export async function runAutomations(
  supabase: Supabase,
  {
    dryRun = false,
    log = console.log,
    campaignIds,
    immediate = false,
  }: { dryRun?: boolean; log?: (message: string) => void; campaignIds?: string[]; immediate?: boolean } = {}
): Promise<RunAutomationsResult> {
  let automationQuery = supabase
    .from("campaign_automations")
    .select("*, campaigns(id, title, kind, client_id, clients(name))")
    .eq("active", true)
  if (campaignIds) automationQuery = automationQuery.in("campaign_id", campaignIds)
  const { data: automations, error: autoError } = await automationQuery

  if (autoError) throw new Error(autoError.message)

  let sent = 0
  let skipped = 0
  let errors = 0
  const runnable = (automations ?? [])
    .map((automation) => ({ automation, campaign: unwrapOne(automation.campaigns as unknown as CampaignJoin | CampaignJoin[] | null) }))
    .filter((x): x is { automation: (typeof x)["automation"]; campaign: CampaignJoin } => !!x.campaign)
    .filter(({ automation }) => automation.trigger !== "status_change" || !!automation.trigger_status)
  if (runnable.length === 0) return { sent, skipped, errors }
  const [berufsbilder, data] = await Promise.all([
    fetchBerufsbilder(supabase),
    loadAutomationData(
      supabase,
      runnable.map(({ automation, campaign }) => ({ id: automation.id, trigger: automation.trigger, campaign }))
    ),
  ])

  for (const { automation, campaign } of runnable) {

    const activeSince = automation.active_since ?? automation.created_at
    const delaySeconds = immediate && automation.delay_seconds <= 60 ? 0 : automation.delay_seconds
    const cutoff = new Date(Date.now() - delaySeconds * 1000).toISOString()
    // Seit wann ein Kandidat zur Kampagne gehört (Kanzlei-Kampagnen: Zeitpunkt der Zuordnung).
    const joinedAt = new Map<string, string>()
    let candidates = campaignCandidates(data, campaign, automation.trigger, automation.trigger_status, joinedAt)
    // Kandidat der Kanzlei-Kampagne zugeordnet (Paket 21): nur Zuordnungen nach dem Einschalten.
    if (automation.trigger === "client_assigned") {
      if (campaign.kind !== "kanzlei") continue
      candidates = candidates.filter((c) => {
        const joined = joinedAt.get(c.id)
        return !!joined && joined <= cutoff && joined >= activeSince
      })
    }
    if (automation.trigger === "new_lead") {
      candidates = candidates.filter((c) => {
        const since = joinedAt.get(c.id) ?? c.created_at
        return since <= cutoff && since >= activeSince
      })
    }
    if (!candidates.length) continue

    const firedIds = new Set(candidates.filter((c) => data.fired.has(`${automation.id}:${c.id}`)).map((c) => c.id))
    const beforeActivation: string[] = []
    const pending = (candidates as CandidateRow[]).filter((c) => !firedIds.has(c.id))
    const reachedAt =
      automation.trigger === "status_change" && pending.length > 0
        ? await statusReachedAtMap(supabase, pending, automation.trigger_status!)
        : new Map<string, string>()

    for (const candidate of candidates as CandidateRow[]) {
      if (firedIds.has(candidate.id)) continue

      try {
        if (automation.trigger === "status_change") {
          // Zählt ab dem späteren Zeitpunkt: Status erreicht oder der Kanzlei-Kampagne
          // zugeordnet (Paket 21) - sonst fiele ein schon vorqualifizierter Kandidat, der
          // nach dem Einschalten zugeordnet wird, durchs Raster.
          const reached = reachedAt.get(candidate.id) ?? candidate.created_at
          const joined = joinedAt.get(candidate.id)
          const statusSince = joined && joined > reached ? joined : reached
          // Status schon vor dem Einschalten erreicht: einmalig als erledigt vermerken,
          // ohne Mail - sonst würde jeder Lauf diese Kandidaten erneut prüfen.
          if (new Date(statusSince).getTime() < new Date(activeSince).getTime()) {
            beforeActivation.push(candidate.id)
            skipped++
            continue
          }
          const readyAt = new Date(statusSince).getTime() + delaySeconds * 1000
          if (Date.now() < readyAt) continue
        }

        const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim()
        const { recipients, subject, html: emailHtml } = await buildAutomationMail(supabase, automation, campaign, candidate, berufsbilder)

        if (recipients.length === 0) {
          // Kein Empfänger ermittelbar (z.B. Kandidat ohne E-Mail, Kunde ohne
          // Kontakt-Adresse) - als "gefeuert" markieren, damit es nicht bei jedem
          // Lauf erneut versucht wird. Kein Versand-Fehler, daher nicht in `errors`.
          if (dryRun) {
            log(
              `[DRY-RUN, kein Empfänger] "${automation.name}" | Kampagne "${campaign.title}" | Kandidat ${candidateName} <${candidate.email ?? "-"}>`
            )
          } else {
            await supabase.from("campaign_automation_runs").insert({
              automation_id: automation.id,
              candidate_id: candidate.id,
              status: "kein_empfaenger",
            })
          }
          skipped++
          continue
        }

        if (dryRun) {
          log(
            `[DRY-RUN] "${automation.name}" | Kampagne "${campaign.title}" | Kandidat ${candidateName} <${candidate.email ?? "-"}> | Empfänger: ${recipients.join(", ")} | Betreff: "${subject}"`
          )
        } else {
          // Keine automatische Kanzlei-Zuordnung mehr (Paket 19, T-86) - der #Bewerberlink
          // öffnet im Portal nur, wenn das Team den Kandidaten der Kanzlei zugeordnet hat.
          // Erst den Lauf reservieren, dann senden: laufen sofortige Auslösung und
          // 5-Minuten-Job gleichzeitig, verschickt nur einer (UNIQUE automation/candidate).
          const { error: claimError } = await supabase.from("campaign_automation_runs").insert({
            automation_id: automation.id,
            candidate_id: candidate.id,
            status: "gesendet",
          })
          if (claimError) {
            if (claimError.code === "23505") {
              skipped++
              continue
            }
            throw new Error(claimError.message)
          }
          let delivered: string[]
          try {
            delivered = await sendEmail(recipients, subject, emailHtml)
          } catch (sendError) {
            // Reservierung zurücknehmen, damit der nächste Lauf es erneut versucht.
            await supabase.from("campaign_automation_runs").delete().eq("automation_id", automation.id).eq("candidate_id", candidate.id)
            throw sendError
          }
          // Versandprotokoll für den Reiter "Automatisierungen" (Paket 84).
          await supabase
            .from("campaign_automation_runs")
            .update(
              delivered.length
                ? { recipients: delivered, last_sent_at: new Date().toISOString(), send_count: 1 }
                : { status: "kein_empfaenger" }
            )
            .eq("automation_id", automation.id)
            .eq("candidate_id", candidate.id)

          await supabase.from("candidate_history").insert({
            candidate_id: candidate.id,
            type: "automation",
            content: `Automatisierung "${automation.name}" ausgelöst (Mail an ${recipients.join(", ")})`,
          })
        }

        sent++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(
          `Automatisierung "${automation.name}" für Kandidat ${candidate.id} fehlgeschlagen: ${message}`
        )
        errors++
        // Bewusst KEIN campaign_automation_runs-Eintrag bei echtem Fehler (z.B.
        // Brevo-API kurzzeitig down) - soll beim nächsten Lauf erneut versucht werden.
      }
    }
    if (!dryRun && beforeActivation.length > 0) {
      await supabase
        .from("campaign_automation_runs")
        .insert(beforeActivation.map((candidateId) => ({ automation_id: automation.id, candidate_id: candidateId, status: "vor_aktivierung" })))
    }
  }

  return { sent, skipped, errors }
}
