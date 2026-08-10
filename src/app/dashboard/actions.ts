"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

export interface LeadtableSyncRunSummary {
  id: string
  started_at: string
  finished_at: string | null
  status: string
  summary: Record<string, number> | null
  error_message: string | null
}

const GITHUB_REPO = "ErikKarsten/kandidatenwerk"
const GITHUB_WORKFLOW_FILE = "leadtable-full-sync.yml"

// Ein "running"-Eintrag blockiert einen neuen Sync nur, wenn er noch plausibel aktiv
// sein könnte. Bisher beobachtete echte Laufzeiten liegen bei bis zu ~130 Minuten
// (siehe leadtable_sync_runs-Historie) - 2 Stunden liegt großzügig darüber. Läuft der
// Prozess (z.B. durch harten Abbruch/OOM/Timeout der CI-Umgebung) ab, ohne den
// try/catch in leadtable-full-sync.ts zu erreichen, bleibt der Eintrag sonst für immer
// auf "running" stehen und blockiert jeden künftigen Sync-Versuch dauerhaft (siehe
// Diagnose vom 2026-08-10: Eintrag d566746b... hing seit 4 Tagen fest). Ältere
// "running"-Einträge gelten deshalb als vermutlich verwaist und blockieren nicht mehr.
const STALE_RUN_THRESHOLD_MS = 2 * 60 * 60 * 1000

export async function triggerLeadtableSyncAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Nicht eingeloggt." }

  const staleCutoff = new Date(Date.now() - STALE_RUN_THRESHOLD_MS).toISOString()
  const { data: runningRun, error: checkError } = await supabase
    .from("leadtable_sync_runs")
    .select("id")
    .eq("status", "running")
    .gte("started_at", staleCutoff)
    .maybeSingle()

  if (checkError) return { success: false, error: checkError.message }
  if (runningRun) return { success: false, error: "Es läuft bereits ein Sync." }

  const token = process.env.GITHUB_ACTIONS_TOKEN
  if (!token) return { success: false, error: "GITHUB_ACTIONS_TOKEN ist nicht konfiguriert." }

  let response: Response
  try {
    response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "kandidatenwerk-leadtable-sync",
        },
        body: JSON.stringify({ ref: "main" }),
      }
    )
  } catch (err) {
    return { success: false, error: `GitHub-API nicht erreichbar: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: `GitHub-API-Fehler (${response.status}): ${text}` }
  }

  return { success: true }
}

export async function getLatestLeadtableSyncRunAction(): Promise<LeadtableSyncRunSummary | null> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase
    .from("leadtable_sync_runs")
    .select("id, started_at, finished_at, status, summary, error_message")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: data.id,
    started_at: data.started_at,
    finished_at: data.finished_at,
    status: data.status,
    summary: (data.summary as Record<string, number> | null) ?? null,
    error_message: data.error_message,
  }
}
