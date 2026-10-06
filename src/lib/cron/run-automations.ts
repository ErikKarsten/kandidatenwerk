// Führt aktive Kampagnen-Automatisierungen aus (campaign_automations): prüft für
// jede aktive Automatisierung, welche Kandidaten ihre Trigger-Bedingung erfüllen
// (neuer Lead bzw. Status seit delay_seconds erreicht), verschickt die Mail über
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
import {
  candidatePortalLink,
  substituteTemplateVars,
  resolveAutomationRecipients,
  wrapAutomationEmailHtml,
} from "@/lib/automation-engine"

type Supabase = SupabaseClient<Database>

interface CandidateRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  status: string
  client_id: string | null
  created_at: string
}

interface CampaignJoin {
  id: string
  title: string
  kind: string
  client_id: string | null
  clients: { name: string } | { name: string }[] | null
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

// Kandidaten einer Kampagne: bei Lead-Kampagnen die darüber beworbenen, bei
// Kanzlei-Kampagnen zusätzlich die ihr zugeordneten (client_assignments.campaign_id) -
// vorher sahen Automatisierungen in Kanzlei-Kampagnen nie einen Kandidaten (Paket 21).
async function loadCampaignCandidates(
  supabase: Supabase,
  campaign: CampaignJoin,
  trigger: string,
  triggerStatus: string | null,
  joinedAt: Map<string, string>
): Promise<CandidateRow[]> {
  const columns = "id, first_name, last_name, email, phone, status, client_id, created_at"
  let own = supabase.from("candidates").select(columns).eq("campaign_id", campaign.id).eq("is_demo", false)
  if (trigger === "status_change") own = own.eq("status", triggerStatus!)
  const { data: ownRows, error } = await own
  if (error) throw new Error(error.message)
  const byId = new Map((ownRows ?? []).map((c) => [c.id, c as CandidateRow]))

  if (campaign.kind === "kanzlei") {
    const { data: assignments, error: aError } = await supabase
      .from("client_assignments")
      .select("candidate_id, created_at")
      .eq("campaign_id", campaign.id)
      .is("removed_at", null)
    if (aError) throw new Error(aError.message)
    for (const a of assignments ?? []) joinedAt.set(a.candidate_id, a.created_at)
    const ids = [...joinedAt.keys()].filter((id) => !byId.has(id))
    for (let i = 0; i < ids.length; i += 80) {
      let q = supabase.from("candidates").select(columns).in("id", ids.slice(i, i + 80)).eq("is_demo", false)
      if (trigger === "status_change") q = q.eq("status", triggerStatus!)
      const { data, error: cError } = await q
      if (cError) throw new Error(cError.message)
      for (const c of data ?? []) byId.set(c.id, c as CandidateRow)
    }
  }
  return [...byId.values()]
}

// dryRun: zeigt nur (über log), was verschickt würde - kein Versand, kein DB-Schreiben.
// In dem Fall stehen sent/skipped für "würde verschicken"/"würde überspringen".
export async function runAutomations(
  supabase: Supabase,
  { dryRun = false, log = console.log }: { dryRun?: boolean; log?: (message: string) => void } = {}
): Promise<RunAutomationsResult> {
  const { data: automations, error: autoError } = await supabase
    .from("campaign_automations")
    .select("*, campaigns(id, title, kind, client_id, clients(name))")
    .eq("active", true)

  if (autoError) throw new Error(autoError.message)

  let sent = 0
  let skipped = 0
  let errors = 0

  for (const automation of automations ?? []) {
    const campaign = unwrapOne(automation.campaigns as unknown as CampaignJoin | CampaignJoin[] | null)
    if (!campaign) continue
    if (automation.trigger === "status_change" && !automation.trigger_status) continue

    const activeSince = automation.active_since ?? automation.created_at
    const cutoff = new Date(Date.now() - automation.delay_seconds * 1000).toISOString()
    let candidates: CandidateRow[]
    // Seit wann ein Kandidat zur Kampagne gehört (Kanzlei-Kampagnen: Zeitpunkt der Zuordnung).
    const joinedAt = new Map<string, string>()
    try {
      candidates = await loadCampaignCandidates(supabase, campaign, automation.trigger, automation.trigger_status, joinedAt)
    } catch (candError) {
      console.error(`Automatisierung "${automation.name}": Kandidaten-Query fehlgeschlagen: ${candError instanceof Error ? candError.message : candError}`)
      errors++
      continue
    }
    if (automation.trigger === "new_lead") {
      candidates = candidates.filter((c) => {
        const since = joinedAt.get(c.id) ?? c.created_at
        return since <= cutoff && since >= activeSince
      })
    }
    if (!candidates.length) continue

    // In Paketen - lange ID-Listen sprengen sonst die URL.
    const firedIds = new Set<string>()
    for (let i = 0; i < candidates.length; i += 80) {
      const { data: alreadyFired } = await supabase
        .from("campaign_automation_runs")
        .select("candidate_id")
        .eq("automation_id", automation.id)
        .in("candidate_id", candidates.slice(i, i + 80).map((c) => c.id))
      for (const r of alreadyFired ?? []) firedIds.add(r.candidate_id)
    }
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
          const readyAt = new Date(statusSince).getTime() + automation.delay_seconds * 1000
          if (Date.now() < readyAt) continue
        }

        const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim()
        // Kanzlei der Kampagne, wenn beim Kandidaten keine hinterlegt ist (Lead-Kampagnen ohne
        // automatische Zuordnung, Kanzlei-Kampagnen über die Zuordnung).
        const recipients = await resolveAutomationRecipients(supabase, automation.recipient, {
          email: candidate.email,
          client_id: candidate.client_id ?? campaign.client_id,
        })

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
            })
          }
          skipped++
          continue
        }

        const vars = {
          Kandidatenname: candidateName,
          Kampagnenname: campaign.title,
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
        const emailHtml = wrapAutomationEmailHtml(bodyText)

        if (dryRun) {
          log(
            `[DRY-RUN] "${automation.name}" | Kampagne "${campaign.title}" | Kandidat ${candidateName} <${candidate.email ?? "-"}> | Empfänger: ${recipients.join(", ")} | Betreff: "${subject}"`
          )
        } else {
          // Keine automatische Kanzlei-Zuordnung mehr (Paket 19, T-86) - der #Bewerberlink
          // öffnet im Portal nur, wenn das Team den Kandidaten der Kanzlei zugeordnet hat.
          await sendEmail(recipients, subject, emailHtml)

          await supabase.from("campaign_automation_runs").insert({
            automation_id: automation.id,
            candidate_id: candidate.id,
          })

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
        .insert(beforeActivation.map((candidateId) => ({ automation_id: automation.id, candidate_id: candidateId })))
    }
  }

  return { sent, skipped, errors }
}
