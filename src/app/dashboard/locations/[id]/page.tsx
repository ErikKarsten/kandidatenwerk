import { ChevronLeft } from "lucide-react"
import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { BackButton } from "@/components/ui/back-button"
import { LocationCampaignsList } from "./location-campaigns-list"

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [{ data: location }, { data: campaigns }] = await Promise.all([
    supabase.from("locations").select("id, plz_prefix, name").eq("id", id).single(),
    supabase
      .from("campaigns")
      .select("id, title, status, berufsbild, created_at, clients(name)")
      .eq("location_id", id)
      .order("created_at", { ascending: false }),
  ])

  if (!location) notFound()

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <BackButton className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft size={16} />
          Zurück zur Übersicht
        </BackButton>

        <h1 className="text-2xl font-bold text-gray-900">
          {location.name ?? `PLZ-Bereich ${location.plz_prefix}xx`}
        </h1>
        {location.name && (
          <p className="mt-1 text-sm text-gray-500 font-mono">PLZ-Bereich {location.plz_prefix}xx</p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          {campaigns?.length ?? 0} Kampagne{(campaigns?.length ?? 0) !== 1 ? "n" : ""}, kundenübergreifend
        </p>
      </div>

      <LocationCampaignsList campaigns={campaigns ?? []} />
    </div>
  )
}
