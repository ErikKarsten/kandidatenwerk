// Einfacher Lasttest (T-106): ruft öffentliche Seiten mit N gleichzeitigen Verbindungen
// auf und misst Antwortzeiten. Standardmäßig gegen Staging - gegen Live nur außerhalb der
// Arbeitszeit und mit kleiner Last (Cloudflare-Anfragen und Supabase-Abfragen zählen mit).
//
// Usage: E2E_BASE_URL=https://... npx tsx scripts/lasttest.ts [gleichzeitig=20] [anfragen=400]
const base = process.env.E2E_BASE_URL
if (!base) throw new Error("E2E_BASE_URL fehlt (Staging-Adresse)")
const concurrency = Number(process.argv[2] ?? 20)
const total = Number(process.argv[3] ?? 400)
const paths = ["/login", "/api/health", "/passwort-vergessen"]

async function main() {
  const times: number[] = []
  const status = new Map<number, number>()
  let next = 0
  const started = Date.now()
  async function worker() {
    while (next < total) {
      const p = paths[next++ % paths.length]
      const t = performance.now()
      try {
        const res = await fetch(base + p, { redirect: "manual" })
        await res.arrayBuffer()
        status.set(res.status, (status.get(res.status) ?? 0) + 1)
      } catch {
        status.set(0, (status.get(0) ?? 0) + 1)
      }
      times.push(performance.now() - t)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  times.sort((a, b) => a - b)
  const q = (x: number) => Math.round(times[Math.min(times.length - 1, Math.floor(times.length * x))])
  const secs = (Date.now() - started) / 1000
  console.log(`${total} Anfragen, ${concurrency} gleichzeitig, ${secs.toFixed(1)} s (${Math.round(total / secs)}/s)`)
  console.log(`Antwortzeit ms: Median ${q(0.5)}, p95 ${q(0.95)}, max ${q(1)}`)
  console.log("Status:", Object.fromEntries(status), "(0 = Verbindungsfehler)")
  console.log(q(0.95) < 1500 && !status.has(0) && ![...status.keys()].some((s) => s >= 500) ? "OK" : "PRÜFEN")
}

main()
