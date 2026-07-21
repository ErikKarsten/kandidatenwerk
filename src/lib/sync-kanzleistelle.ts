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
    normalized.includes("steuerfachangestellte") ||
    normalized.includes("fachangestellte für steuern") ||
    normalized.includes("fachangestellter für steuern") ||
    /\bstfa\b/.test(normalized)
  ) {
    return "steuerfachangestellte"
  }
  if (normalized.includes("steuerfachwirt")) return "steuerfachwirt"
  if (normalized.includes("bilanzbuchhalter")) return "bilanzbuchhalter"
  if (normalized.includes("steuerberater")) return "steuerberater"

  return null
}

export type SyncApplicationsError = {
  applicationId: string
  message: string
}

export type SyncApplicationsResult = {
  created: number
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

  if (limit !== undefined) query = query.limit(limit)

  const { data: applications, error: fetchError } = await query

  if (fetchError) throw new Error(`Kanzleistelle24-Abfrage fehlgeschlagen: ${fetchError.message}`)

  const errors: SyncApplicationsError[] = []
  let created = 0

  for (const application of applications ?? []) {
    try {
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

  return { created, errors }
}
