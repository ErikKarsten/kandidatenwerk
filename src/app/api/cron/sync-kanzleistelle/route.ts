import { NextResponse, type NextRequest } from "next/server"
import { syncApplicationsFromKanzleistelle } from "@/lib/sync-kanzleistelle"

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get("x-cron-secret")

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await syncApplicationsFromKanzleistelle(50)

  return NextResponse.json(result)
}
