import { NextResponse, type NextRequest } from "next/server"
import { syncApplicationsFromKanzleistelle } from "@/lib/sync-kanzleistelle"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { runTrackedCronJob } from "@/lib/cron/job-runs"

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get("x-cron-secret")

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await runTrackedCronJob(createSupabaseAdminClient(), "sync-kanzleistelle", async () => {
    const r = await syncApplicationsFromKanzleistelle(50)
    return { result: r, ok: r.errors.length === 0 }
  })

  return NextResponse.json(result)
}
