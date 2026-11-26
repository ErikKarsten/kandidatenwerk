import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { syncMetaLeads } from "@/lib/cron/meta-leads-sync"
import { ensureLeadgenSubscription, fetchMetaPages } from "@/lib/meta-ads-client"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, stündlich), arbeitet aber nur
// in geraden Stunden (UTC): Neue Leads kommen sofort über den Webhook, der Abgleich ist nur
// das Netz für verpasste Events. Vorher alle 30 Minuten - Meta meldete 429 bei /leads
// (Paket 108). Gleiche Grenze wie die Meta-Anfragen: ein Lauf = 1 + Seiten + Formulare.
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (new Date().getUTCHours() % 2 !== 0 && !request.nextUrl.searchParams.has("jetzt")) {
    return NextResponse.json({ skipped: "Nur alle 2 Stunden (gerade Stunden)." })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "meta-leads-sync", async () => {
    // Nur die letzten 3 Tage: Echtzeit kommt über den Webhook, der Cron ist das Netz für
    // verpasste Events. Ältere Leads per CLI (scripts/meta-leads-sync.ts).
    // Formulare ohne Kampagne (Paket 116): je Lauf ein Sechstel, jedes also alle 12 Stunden.
    const stunde = new Date().getUTCHours()
    const r = await syncMetaLeads(supabase, { sinceDays: 3, ohneKampagne: { scheiben: 6, scheibe: Math.floor(stunde / 2) } })
    // Einmal am Tag alle freigegebenen Seiten für Echtzeit-Leads anmelden - neu
    // freigegebene Kanzleiseiten fehlten sonst, bis jemand ein Formular verknüpft.
    const seitenHinweise: string[] = []
    if (stunde === 6) {
      for (const page of await fetchMetaPages()) {
        if (!page.access_token) continue
        const hinweis = await ensureLeadgenSubscription({ pageId: page.id, pageName: page.name, accessToken: page.access_token })
        if (hinweis) seitenHinweise.push(hinweis)
      }
    }
    return { result: { ...r, seitenHinweise }, ok: r.errors.length === 0 }
  })

  return NextResponse.json(result)
}
