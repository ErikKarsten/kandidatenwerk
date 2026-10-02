// Protokolliert Cron-Läufe in cron_job_runs und alarmiert die Agentur-Admins per Mail,
// wenn ein Lauf fehlschlägt (Migration 20261002000000_cron_job_runs.sql).
//
// Bewusst fehlertolerant: Protokoll und Alarm dürfen den eigentlichen Job nie
// scheitern lassen. Fehlt die Tabelle noch (Migration nicht eingespielt), wird nur
// gewarnt. Mails höchstens alle ALERT_COOLDOWN_HOURS je Job, damit ein dauerhaft
// fehlschlagender 5-Minuten-Job nicht hunderte Mails am Tag erzeugt.

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendEmail } from "@/lib/brevo-mail"
import { getAdminEmails } from "@/lib/get-admin-emails"
import type { Database } from "@/types/database"

const ALERT_COOLDOWN_HOURS = 12
const RETENTION_DAYS = 30

export type CronJobName = "run-automations" | "meta-leads-sync" | "sync-kanzleistelle"

export interface CronJobOutcome<T> {
  result: T
  // false, wenn der Job zwar durchlief, aber Fehler gemeldet hat (z.B. errors > 0)
  ok: boolean
}

// cron_job_runs ist (noch) nicht in src/types/database.ts generiert - daher ungetypter
// Zugriff nur für diese eine Tabelle.
function untyped(supabase: SupabaseClient<Database>): SupabaseClient {
  return supabase as unknown as SupabaseClient
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function runTrackedCronJob<T>(
  supabase: SupabaseClient<Database>,
  job: CronJobName,
  run: () => Promise<CronJobOutcome<T>>
): Promise<T> {
  const startedAt = new Date().toISOString()
  let outcome: CronJobOutcome<T> | null = null
  let thrown: unknown = null

  try {
    outcome = await run()
  } catch (err) {
    thrown = err
  }

  const ok = thrown === null && outcome !== null && outcome.ok
  await recordRun(supabase, job, {
    startedAt,
    ok,
    summary: outcome?.result ?? null,
    error: thrown !== null ? errorMessage(thrown) : null,
  })

  if (thrown !== null) throw thrown
  return outcome!.result
}

async function recordRun(
  supabase: SupabaseClient<Database>,
  job: CronJobName,
  run: { startedAt: string; ok: boolean; summary: unknown; error: string | null }
): Promise<void> {
  const db = untyped(supabase)
  try {
    const { data: inserted, error: insertError } = await db
      .from("cron_job_runs")
      .insert({ job, started_at: run.startedAt, ok: run.ok, summary: run.summary, error: run.error })
      .select("id")
      .single()
    if (insertError) {
      console.warn(`[cron-monitor] Protokoll für ${job} nicht geschrieben: ${insertError.message}`)
      return
    }

    const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString()
    await db.from("cron_job_runs").delete().eq("job", job).lt("started_at", retentionCutoff)

    if (!run.ok) await maybeAlert(supabase, job, inserted.id as string, run)
  } catch (err) {
    console.warn(`[cron-monitor] Protokoll/Alarm für ${job} fehlgeschlagen: ${errorMessage(err)}`)
  }
}

async function maybeAlert(
  supabase: SupabaseClient<Database>,
  job: CronJobName,
  runId: string,
  run: { startedAt: string; summary: unknown; error: string | null }
): Promise<void> {
  const db = untyped(supabase)
  const cooldownCutoff = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 3600 * 1000).toISOString()
  const { data: recentAlert } = await db
    .from("cron_job_runs")
    .select("id")
    .eq("job", job)
    .gte("alert_sent_at", cooldownCutoff)
    .limit(1)
    .maybeSingle()
  if (recentAlert) return

  const recipients = await getAdminEmails(supabase)
  if (recipients.length === 0) return

  const details = run.error ?? JSON.stringify(run.summary, null, 2)
  await sendEmail(
    recipients,
    `Kandidatenwerk: Cron-Job "${job}" fehlgeschlagen`,
    `<p>Der Hintergrundjob <strong>${job}</strong> ist am ${new Date(run.startedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} fehlgeschlagen.</p>
<pre style="white-space:pre-wrap;font-size:12px;background:#f3f4f6;padding:8px">${escapeHtml(details).slice(0, 4000)}</pre>
<p>Weitere Fehlschläge dieses Jobs werden für ${ALERT_COOLDOWN_HOURS} Stunden nicht erneut gemeldet. Logs: <code>npx wrangler tail kandidatenwerk</code></p>`
  )

  await db.from("cron_job_runs").update({ alert_sent_at: new Date().toISOString() }).eq("id", runId)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
