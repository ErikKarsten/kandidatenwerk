// Echtzeit-Webhook für neue Meta-Leads (Alternative/Ergänzung zum periodischen
// Batch-Sync in scripts/meta-leads-sync.ts, der alle 30 Min. per GitHub Action läuft) -
// statt zu warten, bis der nächste Batch-Lauf dran ist, meldet Meta uns aktiv, sobald
// jemand ein Lead-Formular abschickt, und der neue Kandidat landet innerhalb weniger
// Sekunden im System.
//
// Einrichtung (einmalig, im Meta-App-Dashboard unter "Webhooks"):
//   Callback-URL:   https://kandidatenwerk.kanzleistelle24.de/api/webhooks/meta-leadgen
//   Verify-Token:   Wert aus META_WEBHOOK_VERIFY_TOKEN (siehe .env.local/.env.example)
//   Feld:           leadgen
// Danach müssen die einzelnen Seiten noch für den Webhook abonniert werden, siehe
// scripts/meta-subscribe-pages-to-webhook.ts.
//
// Sicherheit: Meta signiert jede Anfrage mit dem App-Secret (X-Hub-Signature-256) - wir
// verifizieren das, BEVOR irgendetwas mit dem Payload gemacht wird, sonst könnte
// theoretisch jeder beliebige Dritte (der die Callback-URL kennt) uns Fake-Leads
// unterschieben.
//
// Timing: Meta erwartet eine schnelle Antwort (sonst Retry/Timeout) - wir bestätigen den
// Empfang deshalb SOFORT mit 200, nachdem die Signatur geprüft ist, und verarbeiten die
// eigentlichen Leads (Graph-API-Nachladen, KI-Zusatzfelder-Extraktion, DB-Insert - das
// kann mehrere Sekunden dauern) danach im Hintergrund per ctx.waitUntil (Cloudflare
// Workers, siehe opennextjs-cloudflare-Doku), statt Meta darauf warten zu lassen.
import { createHmac, timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { fetchMetaPages, fetchMetaLead, fetchMetaLeadForms, isMetaTestLead } from "@/lib/meta-ads-client"
import { processMetaLead } from "@/lib/meta-leads-sync-shared"
import { kampagneFuerLead, offeneFormulareMelden } from "@/lib/lead-zuordnung"
import { runAutomations } from "@/lib/cron/run-automations"
import { sendLeadConfirmations } from "@/lib/lead-confirmation"

// Meta ruft diesen GET-Endpunkt EINMALIG beim Einrichten des Webhooks im App-Dashboard
// auf, um zu prüfen, dass wir wirklich die Adresse kontrollieren - Antwort muss exakt der
// mitgeschickte hub.challenge-Wert sein, aber NUR wenn der Verify-Token stimmt.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse("Verification failed", { status: 403 })
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const provided = signatureHeader.slice("sha256=".length)

  // Längen können sich unterscheiden (z.B. korrupter Header) - timingSafeEqual wirft dann
  // eine Exception statt "false" zurückzugeben, deshalb vorher abfangen.
  const expectedBuf = Buffer.from(expected, "hex")
  const providedBuf = Buffer.from(provided, "hex")
  if (expectedBuf.length !== providedBuf.length) return false

  return timingSafeEqual(expectedBuf, providedBuf)
}

interface LeadgenChangeValue {
  leadgen_id: string
  page_id: string
  form_id: string
}

interface WebhookPayload {
  object?: string
  entry?: {
    id?: string
    changes?: { field?: string; value?: LeadgenChangeValue }[]
  }[]
}

// Verarbeitet einen einzelnen eingehenden Leadgen-Event: Page-Access-Token der Seite
// nachschlagen, vollen Lead nachladen, Kampagne bestimmen (Paket 116: verknüpftes Formular,
// sonst Meta-Kampagne des Leads, sonst Kanzlei der Seite - lead-zuordnung.ts), dann dieselbe
// Anlage-Logik wie der Batch-Sync (processMetaLead). Fehler werden geloggt statt geworfen -
// ein einzelner fehlgeschlagener Lead soll nicht die übrigen Events dieser Zustellung
// blockieren (Meta kann mehrere changes pro Aufruf bündeln).
async function handleLeadgenEvent(value: LeadgenChangeValue) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  try {
    const pages = await fetchMetaPages()
    const page = pages.find((p) => p.id === value.page_id)
    if (!page?.access_token) {
      console.error(`[meta-webhook] Kein Page-Access-Token für Seite ${value.page_id} gefunden (Lead ${value.leadgen_id}).`)
      return
    }

    const lead = await fetchMetaLead(value.leadgen_id, page.access_token)

    // Formularname und übrige Formulare der Seite braucht nur Schritt 3 der Zuordnung -
    // erst laden, wenn das Formular an keiner Kampagne hängt.
    let seite: { name: string; formIds: string[] } | null = null
    let formName: string | null = null
    const { count: verknuepft } = await supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("meta_form_id", value.form_id)
    if (!verknuepft) {
      const forms = await fetchMetaLeadForms(value.page_id, page.access_token)
      formName = forms.find((f) => f.id === value.form_id)?.name ?? null
      seite = { name: page.name, formIds: forms.map((f) => f.id) }
    }

    const treffer = await kampagneFuerLead(supabase, { formId: value.form_id, formName, metaCampaignId: lead.campaign_id ?? null, seite })
    if (treffer === "ignoriert") {
      console.log(`[meta-webhook] Formular ${value.form_id} hängt an einer archivierten bzw. Nicht-KS24-Kampagne, Lead ${value.leadgen_id} wird nicht importiert.`)
      return
    }

    // Meta-Testleads (per "Testlead anfordern"-Button, ueber die Test-Leads-API
    // erzeugt) sollen NICHT als echter Kandidat landen - alle Test-Leads teilen sich
    // dieselbe Dummy-E-Mail, wuerden also unabhaengig von der Kampagne immer mit dem
    // allerersten je erzeugten Testlead kollidieren (siehe Diagnose vom 15.09.2026).
    // Stattdessen bestaetigen wir hier nur, dass die Webhook-Zustellung fuer GENAU
    // diese Kampagne/dieses Formular funktioniert.
    if (isMetaTestLead(lead)) {
      if (treffer?.weg === "formular") {
        const { error: testUpdateError } = await supabase
          .from("campaigns")
          .update({ meta_webhook_last_test_at: new Date().toISOString() })
          .eq("id", treffer.kampagne.id)
        if (testUpdateError) throw new Error(testUpdateError.message)
      }
      console.log(`[meta-webhook] Test-Lead ${value.leadgen_id} (Formular ${value.form_id}): kein Kandidat angelegt.`)
      return
    }

    if (!treffer) {
      console.warn(`[meta-webhook] Keine Kampagne für Formular ${value.form_id} („${formName ?? "?"}“, Seite ${page.name}), Lead ${value.leadgen_id} bleibt offen.`)
      await offeneFormulareMelden(supabase, [
        { formId: value.form_id, formName: formName ?? value.form_id, pageName: page.name, leads: 1, letzterLead: lead.created_time },
      ])
      return
    }

    const campaign = treffer.kampagne
    const outcome = await processMetaLead(supabase, campaign, lead)
    console.log(`[meta-webhook] Lead ${value.leadgen_id} (Kampagne "${campaign.title}", über ${treffer.weg}): ${outcome.status}`)
    // Eingangsbestätigung & Co. sofort statt im nächsten 5-Minuten-Lauf (Paket 22).
    if (outcome.status === "created") {
      try {
        await sendLeadConfirmations(supabase, { candidateIds: [outcome.candidateId] })
        await runAutomations(supabase, { campaignIds: [campaign.id], immediate: true, log: () => {} })
      } catch (autoError) {
        console.error(`[meta-webhook] Sofort-Automatisierung fehlgeschlagen:`, autoError instanceof Error ? autoError.message : autoError)
      }
    }
  } catch (err) {
    console.error(`[meta-webhook] Fehler bei Lead ${value.leadgen_id}:`, err instanceof Error ? err.message : err)
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 })
  }

  const leadgenValues = (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === "leadgen" && change.value)
    .map((change) => change.value!)

  const { ctx } = getCloudflareContext()
  ctx.waitUntil(
    (async () => {
      for (const value of leadgenValues) {
        await handleLeadgenEvent(value)
      }
    })()
  )

  // Sofort bestätigen, bevor die eigentliche Verarbeitung (oben, im Hintergrund) fertig
  // ist - siehe Timing-Kommentar am Dateianfang.
  return NextResponse.json({ received: true })
}
