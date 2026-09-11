// Abonniert ALLE dem System-User zugewiesenen Facebook-Seiten für Leadgen-Webhooks
// (src/app/api/webhooks/meta-leadgen/route.ts) - erspart, das für jede der aktuell 54
// Seiten einzeln im Business Manager anzuklicken.
//
// WICHTIG: Vorher muss im Meta-App-Dashboard unter "Webhooks" die Callback-URL
// (https://kandidatenwerk.kanzleistelle24.de/api/webhooks/meta-leadgen) + der
// Verify-Token (META_WEBHOOK_VERIFY_TOKEN) eingetragen und das Feld "leadgen"
// abonniert sein - das ist ein einmaliger manueller Schritt, der sich nicht per API
// erledigen lässt. Dieses Skript abonniert danach nur die einzelnen SEITEN für die
// (bereits an der App hängenden) Webhooks.
//
// Idempotent: mehrfaches Ausführen (z.B. für neu hinzugekommene Seiten) ist unschädlich,
// eine bereits abonnierte Seite wird von Meta einfach erneut bestätigt.
//
// Usage:
//   npx tsx scripts/meta-subscribe-pages-to-webhook.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { fetchMetaPages, subscribePageToLeadgenWebhook } from "../src/lib/meta-ads-client"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

async function main() {
  const pages = await fetchMetaPages()
  console.log(`${pages.length} Seite(n) gefunden.\n`)

  let succeeded = 0
  const failed: { page: string; message: string }[] = []

  for (const page of pages) {
    if (!page.access_token) {
      failed.push({ page: page.name, message: "Kein Page-Access-Token" })
      continue
    }
    try {
      await subscribePageToLeadgenWebhook(page.id, page.access_token)
      console.log(`✓ ${page.name}`)
      succeeded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`✗ ${page.name}: ${message}`)
      failed.push({ page: page.name, message })
    }
  }

  console.log(`\n── Zusammenfassung ──────────────────────────`)
  console.log(`Erfolgreich abonniert: ${succeeded}`)
  console.log(`Fehlgeschlagen:        ${failed.length}`)
  if (failed.length > 0) {
    for (const f of failed) console.log(`  - ${f.page}: ${f.message}`)
  }
}

main().catch((err) => {
  console.error("Seiten-Abonnement fehlgeschlagen:", err)
  process.exit(1)
})
