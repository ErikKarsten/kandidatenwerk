import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import type { Berufsbild } from "@/lib/berufsbild"
import { geocodePlz } from "@/lib/geocode-plz"
import { matchCandidateToCampaigns } from "@/lib/matching"

type KanzleistelleDatabase = {
  public: {
    Tables: {
      applications: {
        Row: {
          id: string
          first_name: string | null
          last_name: string | null
          email: string | null
          phone: string | null
          position: string | null
          applicant_role: string | null
          postal_code: string | null
          kandidatenwerk_candidate_id: string | null
        }
        Insert: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          position?: string | null
          applicant_role?: string | null
          postal_code?: string | null
          kandidatenwerk_candidate_id?: string | null
        }
        Update: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          email?: string | null
          phone?: string | null
          position?: string | null
          applicant_role?: string | null
          postal_code?: string | null
          kandidatenwerk_candidate_id?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export function mapKanzleistelleBerufsbild(text: string): Berufsbild | null {
  const normalized = text.toLowerCase().trim()

  if (
    // (fach)? statt eines festen .includes("steuerfachangestellte") - fängt auch
    // Tippfehler mit verdoppeltem "fach" ab (z.B. "Steuerfachfachangestellter"),
    // die den reinen Substring-Vergleich sonst brechen.
    /steuerfach(fach)?angestellte/.test(normalized) ||
    normalized.includes("fachangestellte für steuern") ||
    normalized.includes("fachangestellter für steuern") ||
    /\bstfa\b/.test(normalized)
  ) {
    return "steuerfachangestellte"
  }
  if (normalized.includes("steuerfachwirt")) return "steuerfachwirt"
  if (normalized.includes("bilanzbuchhalter")) return "bilanzbuchhalter"
  if (normalized.includes("steuerberater")) return "steuerberater"

  // Fallback: gängige Kürzel, wie sie in Leadtable-Kampagnennamen auftauchen
  // (z.B. "Aachen - SFA", "Schwarz Partners - SFW", "... - BB").
  if (/\bsfa\b/.test(normalized)) return "steuerfachangestellte"
  if (/\bsfw\b/.test(normalized)) return "steuerfachwirt"
  if (/\bstb\b/.test(normalized)) return "steuerberater"
  if (/\bbb\b/.test(normalized)) return "bilanzbuchhalter"

  // Berufe außerhalb der vier Kern-Kategorien, aber trotzdem eindeutig erkennbar -
  // mappen bewusst auf "sonstige" statt auf null (Diagnose: "Lohnbuchhalter" war mit
  // 9 von 49 unerkannten Kampagnen-Titeln die mit Abstand größte Einzelgruppe).
  if (normalized.includes("lohnbuchhalter")) return "sonstige"
  if (normalized.includes("finanzbuchhalter")) return "sonstige"
  if (/\bfibu\b/.test(normalized)) return "sonstige"

  return null
}

export type SyncApplicationsError = {
  applicationId: string
  message: string
}

export type SyncApplicationsResult = {
  created: number
  linkedExisting: number
  // Weitere Bewerbung einer Person, deren Kandidat schon mit einer anderen Bewerbung
  // verknüpft ist - siehe Kommentar im Dublettenschutz unten.
  skippedRepeatApplications: number
  errors: SyncApplicationsError[]
}

export async function syncApplicationsFromKanzleistelle(limit?: number): Promise<SyncApplicationsResult> {
  const kandidatenwerk = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const kanzleistelle = createClient<KanzleistelleDatabase>(
    process.env.KANZLEISTELLE_SUPABASE_URL!,
    process.env.KANZLEISTELLE_SUPABASE_SERVICE_KEY!
  )

  let query = kanzleistelle
    .from("applications")
    .select("id, first_name, last_name, email, phone, position, applicant_role, postal_code")
    .is("kandidatenwerk_candidate_id", null)
    // Neueste zuerst: wiederholte Bewerbungen (siehe skippedRepeatApplications) bleiben
    // dauerhaft unverknüpft und würden bei zufälliger Reihenfolge irgendwann das
    // limit füllen - neue Bewerbungen kämen dann nie mehr durch.
    .order("created_at", { ascending: false })

  if (limit !== undefined) query = query.limit(limit)

  const { data: applications, error: fetchError } = await query

  if (fetchError) throw new Error(`Kanzleistelle24-Abfrage fehlgeschlagen: ${fetchError.message}`)

  const errors: SyncApplicationsError[] = []
  let created = 0
  let linkedExisting = 0
  let skippedRepeatApplications = 0

  for (const application of applications ?? []) {
    try {
      // Dublettenschutz per E-Mail (gleiches Muster wie processMetaLead in
      // meta-leads-sync-shared.ts, Abschnitt "2. Per E-Mail bekannt") - ohne diesen
      // Check legt syncApplicationsFromKanzleistelle bei mehreren Bewerbungen derselben
      // Person (z.B. drei Bewerbungen von Viktoriia Mamchur am 04.09.2026 innerhalb einer
      // Stunde, Diagnose vom 21.09.2026) für jede Bewerbung einen eigenen, doppelten
      // Kandidaten an. Ohne E-Mail (null/leer) ist kein Abgleich möglich - dann wie
      // bisher immer neu anlegen.
      if (application.email) {
        const { data: existingByEmail, error: emailLookupError } = await kandidatenwerk
          .from("candidates")
          .select("id")
          .eq("email", application.email)
          .maybeSingle()
        if (emailLookupError) throw new Error(emailLookupError.message)

        if (existingByEmail) {
          // In der Kanzleistelle-DB ist applications.kandidatenwerk_candidate_id
          // eindeutig - ein Kandidat kann nur mit EINER Bewerbung verknüpft sein. Hängt
          // schon eine andere dran (dieselbe Person hat sich mehrfach beworben, z.B. drei
          // Bewerbungen am 04.09.2026), würde das Update bei jedem Lauf mit "duplicate key"
          // scheitern. Stattdessen überspringen - der Kandidat existiert ja bereits
          // (Fix vom 02.10.2026, Atlas T-21).
          const { data: alreadyLinked, error: linkedLookupError } = await kanzleistelle
            .from("applications")
            .select("id")
            .eq("kandidatenwerk_candidate_id", existingByEmail.id)
            .limit(1)
            .maybeSingle()
          if (linkedLookupError) throw new Error(linkedLookupError.message)
          if (alreadyLinked) {
            skippedRepeatApplications++
            continue
          }

          const { error: updateError } = await kanzleistelle
            .from("applications")
            .update({ kandidatenwerk_candidate_id: existingByEmail.id })
            .eq("id", application.id)
          if (updateError) throw new Error(updateError.message)

          linkedExisting++
          continue
        }
      }

      const berufsbild =
        (application.position && mapKanzleistelleBerufsbild(application.position)) ||
        (application.applicant_role && mapKanzleistelleBerufsbild(application.applicant_role)) ||
        null

      const plz =
        application.postal_code && application.postal_code !== "00000" ? application.postal_code : null
      const coords = plz ? geocodePlz(plz) : null

      const { data: candidate, error: insertError } = await kandidatenwerk
        .from("candidates")
        .insert({
          first_name: application.first_name ?? "",
          last_name: application.last_name ?? "",
          email: application.email,
          phone: application.phone,
          berufsbild,
          plz,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          source: "kanzleistelle24",
          kanzleistelle_application_id: application.id,
        })
        .select("id")
        .single()

      if (insertError) throw new Error(insertError.message)

      const { error: updateError } = await kanzleistelle
        .from("applications")
        .update({ kandidatenwerk_candidate_id: candidate.id })
        .eq("id", application.id)

      if (updateError) throw new Error(updateError.message)

      created++

      try {
        await matchCandidateToCampaigns(kandidatenwerk, candidate.id)
      } catch (matchError) {
        errors.push({
          applicationId: application.id,
          message: `Matching fehlgeschlagen: ${matchError instanceof Error ? matchError.message : String(matchError)}`,
        })
      }
    } catch (err) {
      errors.push({
        applicationId: application.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { created, linkedExisting, skippedRepeatApplications, errors }
}
