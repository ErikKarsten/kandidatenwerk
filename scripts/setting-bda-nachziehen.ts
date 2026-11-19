// "Setting BDA" für Leads nachziehen, die schon auf "SC Terminiert" stehen (Paket 115).
//
//   npx tsx scripts/setting-bda-nachziehen.ts --zaehlen        nur zählen, nichts anlegen
//   npx tsx scripts/setting-bda-nachziehen.ts --los            anlegen (2 Leads parallel)
//
// Je Lead: letzter Call mit Aufnahme ab 7 Minuten → Whisper → Claude füllt die Felder →
// in Close veröffentlicht. Leads, die schon eine automatische Setting BDA haben, werden
// übersprungen (erneuter Start legt nichts doppelt an). Händische stören nicht.
// Whisper läuft über das AI-Binding (wrangler getPlatformProxy, braucht `wrangler login`).
import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const HIER = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(HIER, "../.env.local") })

const SC_STATUS = ["stat_s1QLeMGJ9CjlCSF9J9jmhkBFqPySFhsIhYM35rhh9Tp", "stat_5jesGtifrv9ULOXq3ssvUplls0teGJDiCW4c8ypYBWg"]
const MIN_SEKUNDEN = 7 * 60
const PARALLEL = 2

async function main() {
  const los = process.argv.includes("--los")
  const { closeList } = await import("../src/lib/close-api")
  const { SETTING_BDA_TYPE, istAutomatischeBda, settingBdaFelder, settingBdaAusfuellen, settingBdaVeroeffentlichen } = await import("../src/lib/setting-bda")
  type Act = Record<string, any>

  const leads: Act[] = []
  for (const st of SC_STATUS) leads.push(...(await closeList<Act>(`/lead/?query=${encodeURIComponent(`lead_status:"${st}"`)}&_fields=id,display_name,status_id`, 1000)))
  const sc = leads.filter((l) => SC_STATUS.includes(l.status_id))

  const auftraege: { lead: Act; call: Act }[] = []
  let ohneCall = 0
  let schonAuto = 0
  for (const l of sc) {
    const [calls, bdas] = await Promise.all([
      closeList<Act>(`/activity/call/?lead_id=${l.id}`, 300),
      closeList<Act>(`/activity/custom/?lead_id=${l.id}&custom_activity_type_id=${SETTING_BDA_TYPE}`, 50),
    ])
    const call = calls
      .filter((c) => c.has_recording && c.recording_url && (c.duration ?? 0) >= MIN_SEKUNDEN)
      .sort((a, b) => Date.parse(b.date_created) - Date.parse(a.date_created))[0]
    if (!call) ohneCall++
    else if (bdas.some((b) => istAutomatischeBda(b as never))) schonAuto++
    else auftraege.push({ lead: l, call })
  }
  console.log(`SC-Leads: ${sc.length} | ohne Call ab 7 Min.: ${ohneCall} | schon automatisch: ${schonAuto} | anzulegen: ${auftraege.length} (${auftraege.reduce((s, a) => s + Math.round(a.call.duration / 60), 0)} Min.)`)
  if (!los) return

  const { getPlatformProxy } = await import("wrangler")
  const proxy = await getPlatformProxy<{ AI: never }>({ configPath: path.resolve(HIER, "../wrangler.jsonc") })
  const felder = await settingBdaFelder()
  const protokoll = path.resolve(HIER, "../setting-bda-nachziehen.log")
  let fertig = 0
  const fehler: string[] = []
  const warteschlange = [...auftraege]
  const arbeiter = async () => {
    for (let a = warteschlange.shift(); a; a = warteschlange.shift()) {
      const name = a.lead.display_name
      try {
        const ergebnis = await settingBdaAusfuellen({ telefonat: a.call as never, besprechungen: [], vorhandeneBda: null }, felder, name, proxy.env.AI)
        const id = await settingBdaVeroeffentlichen(a.lead.id, ergebnis.werte)
        fertig++
        const zeile = `${new Date().toISOString()} ok ${a.lead.id} ${id} ${name} (${Math.round(a.call.duration / 60)} Min.)`
        fs.appendFileSync(protokoll, zeile + "\n")
        console.log(`[${fertig + fehler.length}/${auftraege.length}] ✓ ${name}`)
      } catch (err) {
        const meldung = err instanceof Error ? err.message : String(err)
        fehler.push(`${name}: ${meldung.slice(0, 160)}`)
        fs.appendFileSync(protokoll, `${new Date().toISOString()} FEHLER ${a.lead.id} ${name}: ${meldung.slice(0, 300)}\n`)
        console.log(`[${fertig + fehler.length}/${auftraege.length}] ✗ ${name}: ${meldung.slice(0, 120)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter))
  await proxy.dispose()
  console.log(`\nFertig: ${fertig} angelegt, ${fehler.length} Fehler.`)
  for (const f of fehler) console.log("  -", f)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
