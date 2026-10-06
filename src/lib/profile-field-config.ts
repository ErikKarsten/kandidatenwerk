// Lädt die eingestellten Profilfelder und Textbausteine der eigenen Agentur (Paket 18,
// T-80) - RLS beschränkt auf die Agentur des angemeldeten Team-Mitglieds.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import type { PositionSnippet, ProfileFieldSetting } from "@/lib/profile-fields"

export interface ProfileFieldConfig {
  settings: ProfileFieldSetting[]
  snippets: PositionSnippet[]
}

export async function loadProfileFieldConfig(db: SupabaseClient<Database>): Promise<ProfileFieldConfig> {
  const [{ data: settings }, { data: snippets }] = await Promise.all([
    db.from("profile_field_settings").select("scope, key, label, hint, required, active, multiline, is_custom, field_group, sort_order"),
    db.from("position_snippets").select("id, berufsbild, kind, text, sort_order").order("sort_order"),
  ])
  return {
    settings: (settings ?? []) as ProfileFieldSetting[],
    snippets: (snippets ?? []) as PositionSnippet[],
  }
}
