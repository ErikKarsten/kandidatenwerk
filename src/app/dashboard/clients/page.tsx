import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export default async function ClientsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, contact_name, contact_email, phone, active, created_at")
    .order("created_at", { ascending: false })

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunden</h1>
          <p className="mt-1 text-sm text-gray-500">{clients?.length ?? 0} Einträge</p>
        </div>
        <Button asChild style={{ backgroundColor: "#1e56a0" }}>
          <Link href="/dashboard/clients/new">
            <Plus size={16} />
            Neuer Kunde
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Unternehmen</TableHead>
              <TableHead className="text-gray-600">Kontaktperson</TableHead>
              <TableHead className="text-gray-600">E-Mail</TableHead>
              <TableHead className="text-gray-600">Telefon</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">Erstellt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients && clients.length > 0 ? (
              clients.map((client) => (
                <TableRow key={client.id} style={{ borderColor: "#dde3ea" }}>
                  <TableCell className="font-medium text-gray-900">{client.name}</TableCell>
                  <TableCell className="text-gray-600">{client.contact_name ?? "—"}</TableCell>
                  <TableCell className="text-gray-600">
                    {client.contact_email ? (
                      <a
                        href={`mailto:${client.contact_email}`}
                        className="hover:underline"
                        style={{ color: "#1e56a0" }}
                      >
                        {client.contact_email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-gray-600">{client.phone ?? "—"}</TableCell>
                  <TableCell>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: client.active ? "#1a9a6a18" : "#9ca3af18",
                        color: client.active ? "#1a9a6a" : "#6b7280",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: client.active ? "#1a9a6a" : "#9ca3af" }}
                      />
                      {client.active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {new Date(client.created_at).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-gray-400">
                  Noch keine Kunden angelegt.{" "}
                  <Link href="/dashboard/clients/new" style={{ color: "#1e56a0" }} className="hover:underline">
                    Ersten Kunden anlegen
                  </Link>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
