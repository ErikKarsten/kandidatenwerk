// Versandprotokoll der Automatisierungen einer Kampagne (Paket 84): wie viele Mails jede
// Automatisierung verschickt hat, an wen, wann - mit Vorschau und "Erneut senden", falls
// eine Mail nicht angekommen ist. campaign_automation_runs hat keine Policies (nur
// Service-Role), deshalb nur über Server-Actions nach der Staff-Prüfung aufrufen.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { fetchBerufsbilder } from "@/lib/berufsbild-db"
import { buildAutomationMail, type CampaignJoin, type CandidateRow } from "@/lib/cron/run-automations"

type Db = SupabaseClient<Database>

export interface AutomationSend {
  candidateId: string
  candidateName: string
  recipients: string[]
  firedAt: string
  lastSentAt: string
  sendCount: number
}

export interface AutomationSendLog {
  automationId: string
  sends: AutomationSend[]
}

const CANDIDATE_COLUMNS = "id, first_name, last_name, email, phone, status, client_id, created_at, berufsbild, tags"

// Ältere Läufe ohne Status: Empfänger aus dem Verlaufseintrag "Automatisierung "X" ausgelöst
// (Mail an a, b)". Ohne passenden Eintrag gilt der Lauf als nicht verschickt (z.B. kein
// Empfänger oder vor dem Einschalten erreicht).
export function recipientsFromHistory(content: string, automationName: string): string[] | null {
  const prefix = `Automatisierung "${automationName}" ausgelöst (Mail an `
  if (!content.startsWith(prefix) || !content.endsWith(")")) return null
  return content
    .slice(prefix.length, -1)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function loadAutomationSends(db: Db, campaignId: string): Promise<AutomationSendLog[]> {
  const { data: automations, error } = await db.from("campaign_automations").select("id, name").eq("campaign_id", campaignId)
  if (error) throw new Error(error.message)
  if (!automations?.length) return []
  const nameById = new Map(automations.map((a) => [a.id, a.name]))

  const runs: { automation_id: string; candidate_id: string; fired_at: string; status: string | null; recipients: string[]; last_sent_at: string | null; send_count: number; candidates: unknown }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error: runError } = await db
      .from("campaign_automation_runs")
      .select("automation_id, candidate_id, fired_at, status, recipients, last_sent_at, send_count, candidates(first_name, last_name)")
      .in("automation_id", [...nameById.keys()])
      .order("fired_at", { ascending: false })
      .range(from, from + 999)
    if (runError) throw new Error(runError.message)
    runs.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  // Empfänger älterer Läufe aus dem Verlauf.
  const legacyIds = [...new Set(runs.filter((r) => r.status === null).map((r) => r.candidate_id))]
  const historyByCandidate = new Map<string, string[]>()
  for (let i = 0; i < legacyIds.length; i += 80) {
    const { data } = await db
      .from("candidate_history")
      .select("candidate_id, content")
      .eq("type", "automation")
      .in("candidate_id", legacyIds.slice(i, i + 80))
      .like("content", "Automatisierung %")
    for (const h of data ?? []) historyByCandidate.set(h.candidate_id, [...(historyByCandidate.get(h.candidate_id) ?? []), h.content ?? ""])
  }

  const byAutomation = new Map<string, AutomationSend[]>()
  for (const r of runs) {
    let recipients = r.recipients ?? []
    if (r.status === null) {
      const name = nameById.get(r.automation_id) ?? ""
      const hit = (historyByCandidate.get(r.candidate_id) ?? []).map((c) => recipientsFromHistory(c, name)).find((x) => x !== null)
      if (!hit) continue
      recipients = hit
    } else if (r.status !== "gesendet" || recipients.length === 0) continue
    const c = (Array.isArray(r.candidates) ? r.candidates[0] : r.candidates) as { first_name: string; last_name: string } | null
    const list = byAutomation.get(r.automation_id) ?? []
    list.push({
      candidateId: r.candidate_id,
      candidateName: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Ohne Namen",
      recipients,
      firedAt: r.fired_at,
      lastSentAt: r.last_sent_at ?? r.fired_at,
      sendCount: Math.max(1, r.send_count),
    })
    byAutomation.set(r.automation_id, list)
  }
  return automations.map((a) => ({ automationId: a.id, sends: byAutomation.get(a.id) ?? [] }))
}

async function loadMailContext(db: Db, automationId: string, candidateId: string) {
  const [{ data: automation, error }, { data: candidate, error: candidateError }, berufsbilder] = await Promise.all([
    db.from("campaign_automations").select("id, name, recipient, subject, body_html, campaigns(id, title, kind, client_id, clients(name))").eq("id", automationId).single(),
    db.from("candidates").select(CANDIDATE_COLUMNS).eq("id", candidateId).single(),
    fetchBerufsbilder(db),
  ])
  if (error || !automation) throw new Error(error?.message ?? "Automatisierung nicht gefunden.")
  if (candidateError || !candidate) throw new Error(candidateError?.message ?? "Kandidat nicht gefunden.")
  const campaign = (Array.isArray(automation.campaigns) ? automation.campaigns[0] : automation.campaigns) as CampaignJoin | null
  if (!campaign) throw new Error("Kampagne nicht gefunden.")
  const mail = await buildAutomationMail(db, automation, campaign, candidate as unknown as CandidateRow, berufsbilder)
  return { automation, mail }
}

// Vorschau mit den heutigen Angaben (Vorlage und Kandidat können sich seit dem Versand geändert haben).
export async function previewAutomationMail(db: Db, automationId: string, candidateId: string): Promise<{ recipients: string[]; subject: string; html: string }> {
  const { mail } = await loadMailContext(db, automationId, candidateId)
  return { recipients: mail.recipients, subject: mail.subject, html: mail.html }
}

export async function resendAutomationMail(db: Db, automationId: string, candidateId: string, sentBy: string | null): Promise<string[]> {
  const { automation, mail } = await loadMailContext(db, automationId, candidateId)
  if (mail.recipients.length === 0) throw new Error("Kein Empfänger ermittelbar (z. B. keine E-Mail-Adresse hinterlegt).")
  const delivered = await sendEmail(mail.recipients, mail.subject, mail.html)
  if (delivered.length === 0) throw new Error("An diese Adresse werden keine Mails verschickt.")
  const { data: run } = await db.from("campaign_automation_runs").select("send_count").eq("automation_id", automationId).eq("candidate_id", candidateId).maybeSingle()
  const now = new Date().toISOString()
  await db
    .from("campaign_automation_runs")
    .upsert(
      { automation_id: automationId, candidate_id: candidateId, status: "gesendet", recipients: delivered, last_sent_at: now, send_count: Math.max(1, run?.send_count ?? 0) + 1 },
      { onConflict: "automation_id,candidate_id" }
    )
  await db.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "automation",
    content: `Automatisierung "${automation.name}" erneut verschickt (Mail an ${delivered.join(", ")})`,
    ...(sentBy ? { created_by: sentBy } : {}),
  })
  return delivered
}
