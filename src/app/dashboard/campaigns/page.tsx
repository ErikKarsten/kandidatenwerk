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
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
}

const STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  active: { bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  paused: { bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  completed: { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}

export default async function CampaignsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, title, description, status, meta_campaign_id, created_at, clients(name)")
    .order("created_at", { ascending: false })

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kampagnen</h1>
          <p className="mt-1 text-sm text-gray-500">{campaigns?.length ?? 0} Einträge</p>
        </div>
        <Button asChild style={{ backgroundColor: "#1e56a0" }}>
          <Link href="/dashboard/campaigns/new">
            <Plus size={16} />
            Neue Kampagne
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Titel</TableHead>
              <TableHead className="text-gray-600">Kunde</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">Meta-Kampagnen-ID</TableHead>
              <TableHead className="text-gray-600">Erstellt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns && campaigns.length > 0 ? (
              campaigns.map((campaign) => {
                const colors = STATUS_COLORS[campaign.status] ?? STATUS_COLORS.completed
                return (
                  <TableRow key={campaign.id} style={{ borderColor: "#dde3ea" }}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/campaigns/${campaign.id}`}
                        className="hover:underline"
                        style={{ color: "#1e56a0" }}
                      >
                        {campaign.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {Array.isArray(campaign.clients)
                        ? campaign.clients[0]?.name ?? "—"
                        : (campaign.clients as { name: string } | null)?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                        {STATUS_LABEL[campaign.status] ?? campaign.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-500 font-mono text-sm">
                      {campaign.meta_campaign_id ?? "—"}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {new Date(campaign.created_at).toLocaleDateString("de-DE", {
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
                <TableCell colSpan={5} className="py-12 text-center text-gray-400">
                  Noch keine Kampagnen angelegt.{" "}
                  <Link href="/dashboard/campaigns/new" style={{ color: "#1e56a0" }} className="hover:underline">
                    Erste Kampagne anlegen
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
