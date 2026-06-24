export const runtime = 'edge';

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { ClientForm } from "./client-form"

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <Link
          href="/dashboard/clients"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft size={16} />
          Zurück zur Übersicht
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Neuen Kunden anlegen</h1>
        <p className="mt-1 text-sm text-gray-500">Pflichtfelder sind mit * gekennzeichnet.</p>
      </div>

      <div className="w-full max-w-lg rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <ClientForm />
      </div>
    </div>
  )
}
