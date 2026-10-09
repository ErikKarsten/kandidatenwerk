import { cache } from "react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { fetchBerufsbilder } from "@/lib/berufsbild-db"

// Berufsbilder aus der Tabelle (Paket 45), je Anfrage nur einmal geladen. Inaktive sind
// enthalten (für Bezeichnungen bestehender Daten), Formulare filtern mit berufsbildChoices.
export const loadBerufsbilder = cache(async () => fetchBerufsbilder(await createSupabaseServerClient()))
