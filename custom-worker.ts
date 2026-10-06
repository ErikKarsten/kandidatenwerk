// Eigener Cloudflare-Worker-Einstieg (wrangler.jsonc "main"): reicht HTTP-Anfragen
// unverändert an den von OpenNext generierten Next.js-Handler weiter und ergänzt einen
// scheduled-Handler für die Cloudflare Cron Triggers (wrangler.jsonc "triggers.crons").
//
// Hintergrund (02.10.2026): Die Jobs liefen vorher als GitHub-Actions-Cron, den GitHub
// in der Praxis stark verzögert hat (Automationen statt alle 5 Min. nur alle 3-6 Std.).
// Der Cron ruft die geschützten /api/cron/*-Routen direkt im selben Worker auf (kein
// Netzwerk-Umweg), mit CRON_SECRET wie zuvor der GitHub-Workflow für Kanzleistelle.
//
// Siehe https://opennext.js.org/cloudflare/howtos/custom-worker - .open-next/worker.js
// entsteht erst beim Build (opennextjs-cloudflare build), daher die ts-ignore-Zeile.

// ts-ignore statt ts-expect-error: nach einem Build existiert die Datei, dann wäre
// ts-expect-error selbst ein Fehler.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js"

interface Env {
  CRON_SECRET?: string
}

interface ScheduledController {
  cron: string
  scheduledTime: number
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

// Muss exakt zu den Einträgen in wrangler.jsonc "triggers.crons" passen. Mehrere Routen
// je Ausdruck laufen nacheinander (spart Cron-Trigger).
const CRON_ROUTES: Record<string, string[]> = {
  "*/5 * * * *": ["/api/cron/run-automations", "/api/cron/close-meetings"],
  "*/30 * * * *": ["/api/cron/meta-leads-sync"],
  "0 * * * *": ["/api/cron/sync-kanzleistelle", "/api/cron/meta-campaigns-sync"],
  "0 6 * * *": ["/api/cron/task-reminders"],
}

const APP_ORIGIN = "https://kandidatenwerk.kanzleistelle24.de"

async function runCronRoute(path: string, env: Env, ctx: ExecutionContext): Promise<void> {
  if (!env.CRON_SECRET) {
    console.error(`[cron] ${path}: CRON_SECRET ist im Worker nicht gesetzt - Lauf übersprungen.`)
    return
  }

  const request = new Request(APP_ORIGIN + path, {
    method: "POST",
    headers: { "x-cron-secret": env.CRON_SECRET },
  })
  const response: Response = await handler.fetch(request, env, ctx)
  const body = await response.text()

  if (!response.ok) {
    console.error(`[cron] ${path} fehlgeschlagen (${response.status}): ${body}`)
    return
  }
  console.log(`[cron] ${path} ok: ${body}`)
}

const worker = {
  fetch: handler.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const paths = CRON_ROUTES[controller.cron]
    if (!paths) {
      console.error(`[cron] Kein Job für Cron-Ausdruck "${controller.cron}" hinterlegt.`)
      return
    }
    ctx.waitUntil(
      (async () => {
        for (const path of paths) await runCronRoute(path, env, ctx)
      })()
    )
  },
}

export default worker
