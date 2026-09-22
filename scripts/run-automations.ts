// Führt aktive Kampagnen-Automatisierungen aus (campaign_automations): prüft für
// jede aktive Automatisierung, welche Kandidaten ihre Trigger-Bedingung erfüllen
// (neuer Lead bzw. Status seit delay_seconds erreicht), verschickt die Mail über
// den bestehenden Brevo-Versand (sendEmail) und protokolliert den Versand doppelt:
// - campaign_automation_runs: Dedup, verhindert Mehrfachversand bei künftigen Läufen
// - candidate_history (type "automation"): sichtbarer Verlaufs-Eintrag beim Kandidaten
//
// Läuft per Cron alle 5 Minuten (.github/workflows/run-automations.yml) - das ist die
// von GitHub selbst empfohlene Taktung für Scheduled Workflows (kürzere Intervalle
// werden nicht zuverlässig pünktlich ausgeführt). delay_seconds (10/30/60 Sek. in der
// UI) ist dadurch eine Mindestwartezeit, keine sekundengenaue Zusage - eine
// Automatisierung feuert nie zu früh, aber ggf. bis zu ~5 Minuten später.
//
// ACHTUNG new_lead-Trigger: beim ERSTEN Aktivieren einer new_lead-Automatisierung an
// einer Kampagne mit bereits bestehenden Kandidaten feuert sie im ersten Lauf für ALLE
// historischen Kandidaten dieser Kampagne (die die delay_seconds-Wartezeit ja längst
// erfüllen), nicht nur für künftig neu ankommende. Vor dem ersten scharfen Aktivieren
// einer solchen Automatisierung an einer Kampagne mit Bestandskandidaten das explizit
// mitbedenken.
//
// Usage:
//   npx tsx scripts/run-automations.ts
//   npx tsx scripts/run-automations.ts --dry-run   (zeigt nur, was verschickt würde -
//                                                    kein Versand, kein DB-Schreiben)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { sendEmail } from "../src/lib/brevo-mail"
import { substituteTemplateVars, resolveAutomationRecipients } from "../src/lib/automation-engine"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

type Supabase = ReturnType<typeof createClient<Database>>

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
  client_id: string | null
  clients: { name: string } | { name: string }[] | null
}

// Supabase liefert eine to-one-Relation üblicherweise als einzelnes Objekt, in
// bestimmten Konstellationen aber als Array (siehe gleiches Muster in
// campaigns/[id]/page.tsx bei campaign.clients) - hier robust für beide Fälle.
function unwrapOne<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel ?? null
}

// Zeitpunkt, seit dem ein Kandidat in `status` steht - aus dem letzten passenden
// status_change-Verlaufseintrag (siehe updateCandidateStatusAction in
// candidates/actions.ts, Format "Status geändert: alt → neu").
async function statusReachedAt(
  supabase: Supabase,
  candidateId: string,
  createdAt: string,
  status: string
): Promise<string> {
  const { data: rows } = await supabase
    .from("candidate_history")
    .select("content, created_at")
    .eq("candidate_id", candidateId)
    .eq("type", "status_change")
    .order("created_at", { ascending: false })

  const match = (rows ?? []).find((r) => r.content?.endsWith(`→ ${status}`))
  // Fallback für Kandidaten, die z.B. per Import direkt mit diesem Status angelegt
  // wurden (kein status_change-Eintrag vorhanden) - created_at als beste verfügbare
  // Näherung, statt die Automatisierung für diese Kandidaten nie feuern zu lassen.
  return match?.created_at ?? createdAt
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  if (dryRun) {
    console.log("=== --dry-run: es wird NICHTS verschickt und NICHTS in campaign_automation_runs/candidate_history geschrieben ===")
    console.log("")
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const { data: automations, error: autoError } = await supabase
    .from("campaign_automations")
    .select("*, campaigns(id, title, client_id, clients(name))")
    .eq("active", true)

  if (autoError) throw new Error(autoError.message)

  let sent = 0
  let skipped = 0
  let errors = 0

  for (const automation of automations ?? []) {
    const campaign = unwrapOne(automation.campaigns as unknown as CampaignJoin | CampaignJoin[] | null)
    if (!campaign) continue
    if (automation.trigger === "status_change" && !automation.trigger_status) continue

    let query = supabase
      .from("candidates")
      .select("id, first_name, last_name, email, phone, status, client_id, created_at")
      .eq("campaign_id", campaign.id)

    if (automation.trigger === "new_lead") {
      const cutoff = new Date(Date.now() - automation.delay_seconds * 1000).toISOString()
      query = query.lte("created_at", cutoff)
    } else {
      query = query.eq("status", automation.trigger_status!)
    }

    const { data: candidates, error: candError } = await query
    if (candError) {
      console.error(`Automatisierung "${automation.name}": Kandidaten-Query fehlgeschlagen: ${candError.message}`)
      errors++
      continue
    }
    if (!candidates?.length) continue

    const { data: alreadyFired } = await supabase
      .from("campaign_automation_runs")
      .select("candidate_id")
      .eq("automation_id", automation.id)
      .in("candidate_id", candidates.map((c) => c.id))

    const firedIds = new Set((alreadyFired ?? []).map((r) => r.candidate_id))

    for (const candidate of candidates as CandidateRow[]) {
      if (firedIds.has(candidate.id)) continue

      try {
        if (automation.trigger === "status_change") {
          const reachedAt = await statusReachedAt(
            supabase,
            candidate.id,
            candidate.created_at,
            automation.trigger_status!
          )
          const readyAt = new Date(reachedAt).getTime() + automation.delay_seconds * 1000
          if (Date.now() < readyAt) continue
        }

        const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim()
        const recipients = await resolveAutomationRecipients(supabase, automation.recipient, candidate)

        if (recipients.length === 0) {
          // Kein Empfänger ermittelbar (z.B. Kandidat ohne E-Mail, Kunde ohne
          // Kontakt-Adresse) - als "gefeuert" markieren, damit es nicht bei jedem
          // Lauf erneut versucht wird. Kein Versand-Fehler, daher nicht in `errors`.
          if (dryRun) {
            console.log(
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
        }

        const subject = substituteTemplateVars(automation.subject, vars)
        const bodyHtml = substituteTemplateVars(automation.body_html, vars)

        if (dryRun) {
          console.log(
            `[DRY-RUN] "${automation.name}" | Kampagne "${campaign.title}" | Kandidat ${candidateName} <${candidate.email ?? "-"}> | Empfänger: ${recipients.join(", ")} | Betreff: "${subject}"`
          )
        } else {
          await sendEmail(recipients, subject, bodyHtml)

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
  }

  console.log("")
  console.log(dryRun ? "=== Zusammenfassung (--dry-run, nichts davon wurde tatsächlich ausgeführt) ===" : "=== Zusammenfassung ===")
  console.log(
    JSON.stringify(
      dryRun
        ? { wouldSend: sent, wouldSkip: skipped, errors }
        : { sent, skipped, errors },
      null,
      2
    )
  )
  if (errors > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
