import { Users, Megaphone, UserSearch, TrendingUp } from "lucide-react"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ClientCard, type ClientCardProps } from "@/components/dashboard/client-card"

const KPI_DATA = [
  {
    icon: Users,
    label: "Kunden",
    value: 24,
    trend: { value: 12 },
    iconColor: "#1e56a0",
  },
  {
    icon: Megaphone,
    label: "Kampagnen",
    value: 38,
    trend: { value: 8 },
    iconColor: "#4ba3c3",
  },
  {
    icon: UserSearch,
    label: "Kandidaten",
    value: 247,
    trend: { value: 23 },
    iconColor: "#8b5cf6",
  },
  {
    icon: TrendingUp,
    label: "Platzierungen",
    value: 61,
    trend: { value: 5 },
    iconColor: "#1a9a6a",
  },
]

const CLIENTS: ClientCardProps[] = [
  {
    name: "TechCorp GmbH",
    active: true,
    tags: ["IT", "Engineering", "Remote"],
    stats: { kandidaten: 34, kampagnen: 5, platzierungen: 12 },
    pipeline: [
      { status: "neu", count: 8 },
      { status: "pruefung", count: 10 },
      { status: "interview", count: 7 },
      { status: "vorgestellt", count: 5 },
      { status: "platziert", count: 4 },
    ],
  },
  {
    name: "Bau & Partner AG",
    active: true,
    tags: ["Bau", "Handwerk"],
    stats: { kandidaten: 21, kampagnen: 3, platzierungen: 8 },
    pipeline: [
      { status: "neu", count: 4 },
      { status: "pruefung", count: 6 },
      { status: "interview", count: 5 },
      { status: "platziert", count: 6 },
    ],
  },
  {
    name: "Medizin Zentrum Nord",
    active: true,
    tags: ["Medizin", "Pflege", "Teilzeit"],
    stats: { kandidaten: 45, kampagnen: 7, platzierungen: 18 },
    pipeline: [
      { status: "neu", count: 12 },
      { status: "pruefung", count: 14 },
      { status: "interview", count: 8 },
      { status: "vorgestellt", count: 6 },
      { status: "platziert", count: 5 },
    ],
  },
  {
    name: "Logistik Express KG",
    active: false,
    tags: ["Logistik", "Fahrer"],
    stats: { kandidaten: 16, kampagnen: 2, platzierungen: 5 },
    pipeline: [
      { status: "abgelehnt", count: 6 },
      { status: "platziert", count: 5 },
      { status: "neu", count: 5 },
    ],
  },
  {
    name: "Finance Solutions SE",
    active: true,
    tags: ["Finance", "Banking", "Vollzeit"],
    stats: { kandidaten: 29, kampagnen: 4, platzierungen: 9 },
    pipeline: [
      { status: "neu", count: 6 },
      { status: "pruefung", count: 9 },
      { status: "vorgestellt", count: 8 },
      { status: "platziert", count: 6 },
    ],
  },
  {
    name: "Retail Chain Deutschland",
    active: true,
    tags: ["Einzelhandel", "Verkauf"],
    stats: { kandidaten: 18, kampagnen: 3, platzierungen: 7 },
    pipeline: [
      { status: "neu", count: 5 },
      { status: "interview", count: 6 },
      { status: "platziert", count: 7 },
    ],
  },
]

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Übersicht aller Aktivitäten und KPIs</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPI_DATA.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Kunden</h2>
          <span className="text-sm text-gray-500">{CLIENTS.length} Einträge</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CLIENTS.map((client) => (
            <ClientCard key={client.name} {...client} />
          ))}
        </div>
      </div>
    </div>
  )
}
