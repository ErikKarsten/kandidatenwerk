// Gleicht die Tabelle qualified_candidates mit den aktuellen Kandidaten-Daten ab:
// nimmt neu qualifizierte Kandidaten auf, entfernt welche, die die Kriterien nicht
// mehr erfüllen (z.B. weil sie nachträglich abgelehnt wurden). Kriterien siehe
// src/lib/qualified-candidates.ts. Läuft als eigenständiger, wiederholbarer Batch-Lauf
// (wie duplicate-check.ts) statt event-getrieben bei jeder Status-/Profil-Änderung -
// einfacher und robuster als das an jede einzelne Änderungsstelle im Code zu hängen,
// auf Kosten von etwas Verzögerung bis zur nächsten Aktualisierung.
//
// Usage:
//   npx tsx scripts/refresh-qualified-candidates.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { evaluateQualification } from "../src/lib/qualified-candidates"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const { data: candidates, error: candidatesError } = await supabase
    .from("candidates")
    .select("id, status, berufsbild, custom_fields")

  if (candidatesError) throw new Error(candidatesError.message)

  const { data: currentlyQualified, error: qualifiedError } = await supabase
    .from("qualified_candidates")
    .select("candidate_id")

  if (qualifiedError) throw new Error(qualifiedError.message)

  const currentlyQualifiedIds = new Set((currentlyQualified ?? []).map((q) => q.candidate_id))

  let added = 0
  let removed = 0

  for (const candidate of candidates ?? []) {
    const result = evaluateQualification(candidate)
    const isCurrentlyIn = currentlyQualifiedIds.has(candidate.id)

    if (result.qualifies && !isCurrentlyIn) {
      const { error } = await supabase
        .from("qualified_candidates")
        .insert({ candidate_id: candidate.id, criteria_reason: result.reason })
      if (error) throw new Error(`Insert fehlgeschlagen für ${candidate.id}: ${error.message}`)
      added++
    } else if (!result.qualifies && isCurrentlyIn) {
      const { error } = await supabase
        .from("qualified_candidates")
        .delete()
        .eq("candidate_id", candidate.id)
      if (error) throw new Error(`Delete fehlgeschlagen für ${candidate.id}: ${error.message}`)
      removed++
    }
  }

  console.log(`Qualifizierte-Kandidaten-Abgleich fertig: ${added} neu aufgenommen, ${removed} entfernt.`)
}

main().catch((err) => {
  console.error("Abgleich fehlgeschlagen:", err)
  process.exit(1)
})
