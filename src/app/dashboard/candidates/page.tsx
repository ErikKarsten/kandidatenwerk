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

const STATUS_LABEL: Record<string, string> = {
  neu: "Neu",
  interview: "Interview",
  vorgestellt: "Vorgestellt",
  platziert: "Platziert",
  abgelehnt: "Abgelehnt",
}

const STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  neu: { bg: "#4ba3c318", dot: "#4ba3c3", text: "#0e7490" },
  interview: { bg: "#1e56a018", dot: "#1e56a0", text: "#1e56a0" },
  vorgestellt: { bg: "#8b5cf618", dot: "#8b5cf6", text: "#7c3aed" },
  platziert: { bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  abgelehnt: { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}

const FALLBACK_COLOR = { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" }

export default async function CandidatesPage() {
  const supabase = await createSupabaseServerClient()

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, email, status, created_at")
    .order("created_at", { ascending: false })

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kandidaten</h1>
          <p className="mt-1 text-sm text-gray-500">{candidates?.length ?? 0} Einträge</p>
        </div>
        <Button asChild style={{ backgroundColor: "#1e56a0" }}>
          <Link href="/dashboard/candidates/new">
            <Plus size={16} />
            Neuer Kandidat
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Name</TableHead>
              <TableHead className="text-gray-600">E-Mail</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">Erstellt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates && candidates.length > 0 ? (
              candidates.map((c) => {
                const colors = STATUS_COLORS[c.status] ?? FALLBACK_COLOR
                return (
                  <TableRow key={c.id} style={{ borderColor: "#dde3ea" }}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/candidates/${c.id}`}
                        className="hover:underline"
                        style={{ color: "#1e56a0" }}
                      >
                        {c.first_name} {c.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                          {c.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {new Date(c.created_at).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-gray-400">
                  Noch keine Kandidaten vorhanden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
