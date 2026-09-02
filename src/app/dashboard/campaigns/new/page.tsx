import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { BackButton } from "@/components/ui/back-button"
import { CampaignForm } from "./campaign-form"

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>
}) {
  const { client_id } = await searchParams
  const supabase = await createSupabaseServerClient()

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("active", true)
    .order("name")

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        {client_id ? (
          <Link
            href={`/dashboard/clients/${client_id}`}
            className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft size={16} />
            Zurück
          </Link>
        ) : (
          <BackButton className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ChevronLeft size={16} />
            Zurück
          </BackButton>
        )}
        <h1 className="text-2xl font-bold text-gray-900">Neue Kampagne anlegen</h1>
        <p className="mt-1 text-sm text-gray-500">Pflichtfelder sind mit * gekennzeichnet.</p>
      </div>

      <div className="w-full max-w-lg rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <CampaignForm clients={clients ?? []} defaultClientId={client_id ?? null} />
      </div>
    </div>
  )
}
