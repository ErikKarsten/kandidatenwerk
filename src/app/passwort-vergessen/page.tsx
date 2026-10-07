import Link from "next/link"
import { Briefcase } from "lucide-react"
import { ResetForm } from "./reset-form"
import { LegalLinks } from "@/components/legal-links"

export const metadata = {
  title: "Passwort vergessen – Kandidatenwerk",
}

export default function PasswortVergessenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: "#f0f4f8" }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: "#0f2137" }}>
            <Briefcase size={22} style={{ color: "#4ba3c3" }} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">Passwort vergessen</h1>
            <p className="mt-1 text-sm text-gray-500">Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.</p>
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: "#dde3ea" }}>
          <ResetForm />
        </div>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="hover:underline" style={{ color: "#1e56a0" }}>
            Zurück zur Anmeldung
          </Link>
        </p>
        <LegalLinks className="mt-6 text-gray-400" />
      </div>
    </div>
  )
}
