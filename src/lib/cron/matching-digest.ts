// Matching-Übersicht (Paket 96): stündlicher Abgleich der Vorschläge und Mo + Do morgens eine
// Sammel-Mail an die Empfänger aus Einstellungen -> Automatisierung (Startwert Steffen
// Neubert und Elea Günther). Läuft per Cloudflare Cron Trigger (custom-worker.ts ->
// /api/cron/matching, jede volle Stunde).
//
// Die Mail zählt nur Vorschläge, die noch in keiner Mail standen (notified_at leer). Gibt es
// nichts Neues, geht keine Mail raus.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { emailButton, renderEmailLayout } from "@/lib/email-layout"
import { berlinToday } from "@/lib/cron/task-reminders"
import { computeSuggestions, loadMatchingInput, pairKey, syncMatchingSuggestions, type MatchingInput, type SuggestionPair } from "@/lib/matching-suggestions"

type Supabase = SupabaseClient<Database>

const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"
const DIGEST_WEEKDAYS = ["Mon", "Thu"]
// Ab 8 Uhr deutscher Zeit; spätere Stunden holen einen ausgefallenen Lauf nach.
const DIGEST_FIRST_HOUR = 8
const DIGEST_LAST_HOUR = 11
const MAX_LINES = 15

export interface MatchingCronResult {
  open: number
  added: number
  removed: number
  digest: "kein_termin" | "schon_gesendet" | "nichts_neu" | "keine_empfaenger" | "gesendet"
  newSuggestions: number
  mailsSent: number
  errors: number
}

function berlinParts(now: Date): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now)
  return { weekday: parts.find((p) => p.type === "weekday")?.value ?? "", hour: Number(parts.find((p) => p.type === "hour")?.value ?? -1) }
}

export function isDigestSlot(now: Date): boolean {
  const { weekday, hour } = berlinParts(now)
  return DIGEST_WEEKDAYS.includes(weekday) && hour >= DIGEST_FIRST_HOUR && hour <= DIGEST_LAST_HOUR
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function buildDigestHtml(fresh: SuggestionPair[], openCount: number, input: Pick<MatchingInput, "campaigns" | "liveClients">): string {
  const campaigns = new Map(input.campaigns.map((c) => [c.id, c]))
  const perCampaign = new Map<string, number>()
  for (const p of fresh) perCampaign.set(p.campaignId, (perCampaign.get(p.campaignId) ?? 0) + 1)
  const lines = [...perCampaign.entries()].sort((a, b) => b[1] - a[1])

  const items = lines
    .slice(0, MAX_LINES)
    .map(([campaignId, count]) => {
      const campaign = campaigns.get(campaignId)
      const client = campaign?.client_id ? input.liveClients.get(campaign.client_id) : null
      const label = [client, campaign?.title].filter(Boolean).join(" – ") || "Kampagne"
      return `<li style="margin-bottom:6px"><span style="font-weight:500">${escapeHtml(label)}</span>: ${count} ${count === 1 ? "Kandidat" : "Kandidaten"}</li>`
    })
    .join("")
  const more = lines.length > MAX_LINES ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px">… und ${lines.length - MAX_LINES} weitere Kampagnen.</p>` : ""
  const openNote = openCount > fresh.length ? `<p style="margin:12px 0 0;color:#6b7280;font-size:13px">Insgesamt ${openCount} offene Vorschläge.</p>` : ""

  return renderEmailLayout({
    heading: fresh.length === 1 ? "1 neuer Matching-Vorschlag" : `${fresh.length} neue Matching-Vorschläge`,
    contentHtml:
      `<p style="margin:0 0 12px">Diese vorqualifizierten Kandidaten passen zu einer Kampagne im Umkreis und waren der Kanzlei noch nicht zugeordnet. Bitte einmal prüfen: zuordnen oder „Nicht vorschlagen“.</p>` +
      `<ul style="padding-left:18px;margin:0">${items}</ul>${more}${openNote}` +
      emailButton(`${APP_BASE_URL}/dashboard/matching`, "Zur Matching-Übersicht"),
  })
}

export async function runMatchingCron(db: Supabase, now: Date = new Date()): Promise<MatchingCronResult> {
  const input = await loadMatchingInput(db)
  const pairs = computeSuggestions(input)
  const sync = await syncMatchingSuggestions(db, input, pairs)
  const result: MatchingCronResult = { ...sync, digest: "kein_termin", newSuggestions: 0, mailsSent: 0, errors: 0 }
  if (!isDigestSlot(now)) return result

  const today = berlinToday(now)
  if (input.rows.some((r) => r.notified_at && berlinToday(new Date(r.notified_at)) === today)) {
    result.digest = "schon_gesendet"
    return result
  }

  const notified = new Set(input.rows.filter((r) => r.notified_at).map((r) => pairKey(r.candidate_id, r.campaign_id)))
  const fresh = pairs.filter((p) => !notified.has(pairKey(p.candidateId, p.campaignId)))
  result.newSuggestions = fresh.length
  if (fresh.length === 0) {
    result.digest = "nichts_neu"
    return result
  }

  const { data: recipientRows, error: recipientsError } = await db.from("matching_mail_recipients").select("profile_id")
  if (recipientsError) throw new Error(recipientsError.message)
  const { data: profiles, error: profilesError } = recipientRows?.length
    ? await db.from("profiles").select("id, email, role, team").in("id", recipientRows.map((r) => r.profile_id))
    : { data: [], error: null }
  if (profilesError) throw new Error(profilesError.message)
  if (!profiles || profiles.length === 0) {
    result.digest = "keine_empfaenger"
    return result
  }

  // Active-Sourcing-Kandidaten sehen nur Admins und das eigene Team (Paket 89) - die Mail
  // zählt für jeden nur, was er in der Übersicht auch sieht.
  const activeSourcing = new Set(input.candidates.filter((c) => c.source === "active_sourcing").map((c) => c.id))
  for (const p of profiles) {
    const seesAll = p.role === "agency_admin" || p.team === "sales_recruiting_active_sourcing"
    const own = seesAll ? fresh : fresh.filter((s) => !activeSourcing.has(s.candidateId))
    if (own.length === 0) continue
    try {
      let email = p.email ?? null
      if (!email) {
        const { data } = await db.auth.admin.getUserById(p.id)
        email = data.user?.email ?? null
      }
      if (!email) continue
      const openCount = seesAll ? pairs.length : pairs.filter((s) => !activeSourcing.has(s.candidateId)).length
      const subject = own.length === 1 ? "1 neuer Matching-Vorschlag" : `${own.length} neue Matching-Vorschläge`
      await sendEmail([email], subject, buildDigestHtml(own, openCount, input))
      result.mailsSent++
    } catch (err) {
      console.error(`[matching] Sammel-Mail an ${p.id} fehlgeschlagen:`, err)
      result.errors++
    }
  }

  // Nur als gemeldet markieren, wenn mindestens eine Mail rausging - sonst holt der nächste
  // Lauf es nach.
  if (result.mailsSent > 0) {
    const stamp = now.toISOString()
    const byCampaign = new Map<string, string[]>()
    for (const p of fresh) byCampaign.set(p.campaignId, [...(byCampaign.get(p.campaignId) ?? []), p.candidateId])
    for (const [campaignId, candidateIds] of byCampaign) {
      for (let i = 0; i < candidateIds.length; i += 100) {
        const { error } = await db.from("matching_suggestions").update({ notified_at: stamp }).eq("campaign_id", campaignId).in("candidate_id", candidateIds.slice(i, i + 100))
        if (error) throw new Error(error.message)
      }
    }
  }
  result.digest = result.mailsSent > 0 ? "gesendet" : "keine_empfaenger"
  return result
}
