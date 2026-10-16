// Dateien (v. a. Lebensläufe) aus Leadtable an die Kandidaten in Kandidatenwerk hängen
// (Paket 69). Grundlage ist der Verlauf der Leads im Neuimport-Cache: Einträge "fileUpload"
// enthalten Dateiname, Größe, Typ und die Speicher-ID (blobURL); "fileDelete" nimmt eine
// Datei wieder heraus. Zuordnung über leadtable_lead_id, sonst E-Mail. Jede Datei nur einmal;
// schon vorhandene (gleicher Name und Größe am Kandidaten) werden übersprungen.
// Zugeordnete Kanzleien sehen die Dateien danach im Portal.
//
// OFFEN: Die Leadtable-Schnittstelle bietet (Stand 16.10.2026) keinen bekannten Download -
// downloadBlob() unten ist ergänzt, sobald Leadtable den Weg nennt.
//
//   npx tsx scripts/leadtable-dateien.ts                Probelauf (zählt, lädt nichts)
//   npx tsx scripts/leadtable-dateien.ts --ausfuehren   lädt herunter und legt an
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const EXECUTE = process.argv.includes("--ausfuehren")
const CACHE = path.resolve(__dirname, "../neuimport/leadtable-cache.json")
// SVG sind in Leadtable meist Signatur- oder Logo-Grafiken, keine Unterlagen.
const SKIP_MIME = new Set(["image/svg+xml"])

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

interface Blob {
  filename: string
  filesize?: number
  mimetype?: string
  blobURL: string
}
interface LtLead {
  _id: string
  email?: string | null
  history?: { itemType?: string; createdAt?: string; deleted?: { state?: boolean }; payload?: { blobURL?: string; uploadID?: { blobs?: Blob[] } } }[]
}

// Datei-Inhalt aus Leadtable. Noch ohne bekannten Weg - siehe OFFEN oben.
async function downloadBlob(blob: Blob, lead: LtLead): Promise<ArrayBuffer> {
  void lead
  throw new Error(`Download aus Leadtable noch nicht möglich (Datei ${blob.blobURL}) - Weg bei Leadtable erfragen.`)
}

async function main() {
  const customers: { campaigns: { leads: LtLead[] }[] }[] = JSON.parse(fs.readFileSync(CACHE, "utf8"))

  const byLead = new Map<string, string>()
  const byMail = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("candidates").select("id, leadtable_lead_id, email").order("id").range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      if (c.leadtable_lead_id) byLead.set(c.leadtable_lead_id, c.id)
      if (c.email) byMail.set(c.email.toLowerCase(), c.id)
    }
    if (!data || data.length < 1000) break
  }

  // Je Datei einmal (der Verlauf enthält bei jedem Upload die ganze Liste).
  const seen = new Set<string>()
  const todo: { candidateId: string; blob: Blob; lead: LtLead; at: string | undefined }[] = []
  let unmapped = 0
  for (const cu of customers)
    for (const camp of cu.campaigns)
      for (const lead of camp.leads) {
        const history = lead.history ?? []
        const deleted = new Set(history.filter((h) => h.itemType === "fileDelete").map((h) => h.payload?.blobURL))
        for (const h of history) {
          if (h.itemType !== "fileUpload" || h.deleted?.state) continue
          for (const blob of h.payload?.uploadID?.blobs ?? []) {
            if (!blob.blobURL || seen.has(blob.blobURL) || deleted.has(blob.blobURL) || SKIP_MIME.has(blob.mimetype ?? "")) continue
            seen.add(blob.blobURL)
            const candidateId = byLead.get(lead._id) ?? (lead.email ? byMail.get(lead.email.toLowerCase()) : undefined)
            if (!candidateId) {
              unmapped++
              continue
            }
            todo.push({ candidateId, blob, lead, at: h.createdAt })
          }
        }
      }

  // Schon vorhandene Dateien (gleicher Name und Größe am Kandidaten) überspringen.
  const { data: existing } = await db.from("candidate_files").select("candidate_id, file_name, file_size")
  const have = new Set((existing ?? []).map((f) => `${f.candidate_id}|${f.file_name}|${f.file_size ?? ""}`))
  const fresh = todo.filter((t) => !have.has(`${t.candidateId}|${t.blob.filename}|${t.blob.filesize ?? ""}`))
  const mb = Math.round(fresh.reduce((s, t) => s + (t.blob.filesize ?? 0), 0) / 1e6)
  console.log(`MODUS: ${EXECUTE ? "AUSFÜHREN" : "Probelauf (lädt nichts)"}`)
  console.log(`Dateien zu Kandidaten in Kandidatenwerk: ${todo.length} (${new Set(todo.map((t) => t.candidateId)).size} Kandidaten), ohne Kandidat: ${unmapped}`)
  console.log(`Davon neu: ${fresh.length} (${mb} MB), schon vorhanden: ${todo.length - fresh.length}`)
  if (!EXECUTE) return

  let ok = 0
  for (const t of fresh) {
    try {
      const content = await downloadBlob(t.blob, t.lead)
      const storagePath = `${t.candidateId}/${Date.now()}-${t.blob.filename}`
      const { error: uploadError } = await db.storage.from("candidate-files").upload(storagePath, content, { contentType: t.blob.mimetype ?? undefined })
      if (uploadError) throw new Error(uploadError.message)
      const { error: insertError } = await db.from("candidate_files").insert({
        candidate_id: t.candidateId,
        file_name: t.blob.filename,
        file_path: storagePath,
        file_size: t.blob.filesize ?? content.byteLength,
        mime_type: t.blob.mimetype ?? null,
        ...(t.at ? { created_at: t.at } : {}),
      })
      if (insertError) throw new Error(insertError.message)
      ok++
    } catch (err) {
      console.error(`${t.blob.filename}: ${err instanceof Error ? err.message : err}`)
      if (ok === 0) break
    }
  }
  console.log(`Fertig: ${ok} von ${fresh.length} Dateien angelegt.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
