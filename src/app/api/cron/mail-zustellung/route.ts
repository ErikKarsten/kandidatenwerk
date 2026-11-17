import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { checkMailDelivery } from "@/lib/mail-delivery"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, stündlich): abgewiesene Mails
// erneut verschicken oder melden (Paket 106, src/lib/mail-delivery.ts).
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "mail-zustellung", async () => {
    // mail_versand/mail_zustellprobleme sind noch nicht in src/types/database.ts generiert.
    const r = await checkMailDelivery(supabase as unknown as SupabaseClient)
    return { result: r, ok: r.errors.length === 0 }
  })

  return NextResponse.json(result)
}
