import { createSupabaseServerClient } from "@/lib/supabase-server"
import { LocationsList } from "./locations-list"

export default async function LocationsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: locations } = await supabase
    .from("locations")
    .select("id, plz_prefix, name, campaigns(count)")

  // Absteigend nach Kampagnen-Anzahl - die Standorte mit den meisten laufenden
  // Kampagnen sind für die tägliche Arbeit am relevantesten und sollen zuerst kommen.
  const locationList = (locations ?? [])
    .map((l) => {
      const countRow = Array.isArray(l.campaigns) ? l.campaigns[0] : null
      const campaign_count = countRow ? Number((countRow as { count: number | string }).count) : 0
      return { id: l.id, plz_prefix: l.plz_prefix, name: l.name, campaign_count }
    })
    .sort((a, b) => b.campaign_count - a.campaign_count)

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Standorte</h1>
        <p className="mt-1 text-sm text-gray-500">
          {locationList.length} PLZ-Bereich{locationList.length !== 1 ? "e" : ""}
        </p>
      </div>

      {locationList.length === 0 ? (
        <div
          className="rounded-xl border bg-white py-16 text-center text-sm text-gray-400"
          style={{ borderColor: "#dde3ea" }}
        >
          Noch keine Standorte vorhanden. Standorte entstehen automatisch, sobald Kampagnen
          eine PLZ bekommen.
        </div>
      ) : (
        <LocationsList locations={locationList} />
      )}
    </div>
  )
}
