import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { BERUFSBILD_OPTIONS, type BerufsbildOption } from "@/lib/berufsbild"

// Berufsbilder aus der Tabelle (Paket 45) mit beliebigem Client - auch für Skripte und
// Cron-Jobs. Fällt auf die Standardliste zurück, wenn die Tabelle leer/nicht lesbar ist.
export async function fetchBerufsbilder(db: SupabaseClient<Database>): Promise<BerufsbildOption[]> {
  const { data, error } = await db.from("berufsbilder").select("key, label, active").order("sort_order").order("label")
  if (error || !data?.length) return BERUFSBILD_OPTIONS
  return data.map((b) => ({ value: b.key, label: b.label, active: b.active }))
}
