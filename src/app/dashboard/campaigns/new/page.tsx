import Link from "next/link"
import { notFound } from "next/navigation"
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

  // Kanzlei-Kampagnen werden immer im Kundenprofil angelegt (Atlas T-32) - ohne
  // client_id gibt es kein Formular mehr, sondern einen Hinweis.
  const { data: client } = client_id
    ? await supabase.from("clients").select("id, name").eq("id", client_id).maybeSingle()
    : { data: null }
  if (client_id && !client) notFound()

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
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
        {client ? (
          <CampaignForm clientId={client.id} clientName={client.name} />
        ) : (
          <p className="text-sm text-gray-600">
            Kampagnen gehören immer zu einem Kunden und werden im Kundenprofil angelegt.{" "}
            <Link href="/dashboard/clients" className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
              Zu den Kunden
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
