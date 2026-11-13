// Sicherheitsprüfung vor dem Staging-Deploy (Paket 102): Steckt irgendein Wert aus der
// Live-Konfiguration (.env.local) im gebauten Worker, wird abgebrochen. Gibt nur die NAMEN
// betroffener Einträge aus, nie Werte.
//
// Werte, die bewusst in Staging und Live gleich sind (z. B. derselbe Brevo-Schlüssel), stehen
// mit demselben Wert in .env.staging und werden nicht beanstandet.
//
// Usage: node scripts/staging-build-check.mjs <live-env-datei> <staging-env-datei> <gebauter-ordner>
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

const [liveEnvFile, stagingEnvFile, target] = process.argv.slice(2)
if (!liveEnvFile || !stagingEnvFile || !target) {
  console.error("Usage: node scripts/staging-build-check.mjs <live-env-datei> <staging-env-datei> <ziel>")
  process.exit(2)
}

function readEnv(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf("=")
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")]
    })
}

const sharedOnPurpose = new Set(readEnv(stagingEnvFile).map(([, value]) => value))
const liveValues = readEnv(liveEnvFile)
  // Kurze Werte (z. B. "v21.0", "true") kommen auch in Staging vor und sind kein Geheimnis.
  .filter(([, value]) => value.length >= 8 && !sharedOnPurpose.has(value))

function files(p) {
  return statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => files(path.join(p, f))) : [p]
}

const leaks = new Set()
for (const file of files(target)) {
  const content = readFileSync(file, "utf8")
  for (const [name, value] of liveValues) if (content.includes(value)) leaks.add(name)
}

if (leaks.size) {
  console.error(`ABBRUCH: Live-Werte im Staging-Build gefunden: ${[...leaks].join(", ")}`)
  process.exit(1)
}
console.log(`Sicherheitsprüfung ok: keiner von ${liveValues.length} Live-Werten im Staging-Build.`)
