import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { sipgateWebhookToken, sipgateWebhookUrl } from "@/lib/sipgate"
import { handleAnswer, handleHangup, handleNewCall, parsePushEvent, pushSubscribeXml } from "@/lib/sipgate-calls"

// sipgate.io Push-API (Paket 92): newCall, answer, hangup. sipgate signiert nicht - geschützt
// über den geheimen Teil der Adresse (?token=…, abgeleitet in sipgateWebhookToken()).
async function validToken(provided: string | null): Promise<boolean> {
  if (!provided) return false
  const a = Buffer.from(await sipgateWebhookToken())
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

const EMPTY_XML = '<?xml version="1.0" encoding="UTF-8"?>\n<Response />'
const xml = (body: string) => new NextResponse(body, { headers: { "Content-Type": "application/xml" } })

export async function POST(request: NextRequest) {
  if (!(await validToken(request.nextUrl.searchParams.get("token")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return xml(EMPTY_XML)
  }
  const event = parsePushEvent(form)
  if (!event) return xml(EMPTY_XML)
  const db = createSupabaseAdminClient() as unknown as SupabaseClient
  try {
    if (event.event === "newCall") {
      const tracked = await handleNewCall(db, event)
      return xml(tracked ? pushSubscribeXml(await sipgateWebhookUrl()) : EMPTY_XML)
    }
    if (event.event === "answer") await handleAnswer(db, event)
    if (event.event === "hangup") await handleHangup(db, event)
  } catch (err) {
    // Nie den Anruf stören: sipgate bekommt immer eine gültige Antwort.
    console.error("[sipgate-webhook]", err instanceof Error ? err.message : err)
  }
  return xml(EMPTY_XML)
}
