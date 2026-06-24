import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
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
        <Link
          href={client_id ? `/dashboard/clients/${client_id}` : "/dashboard/campaigns"}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft size={16} />
          Zurück
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Neue Kampagne anlegen</h1>
        <p className="mt-1 text-sm text-gray-500">Pflichtfelder sind mit * gekennzeichnet.</p>
      </div>

      <div className="w-full max-w-lg rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <CampaignForm clients={clients ?? []} defaultClientId={client_id ?? null} />
      </div>
    </div>
  )
}
