import { redirect } from "next/navigation"

// Die Kampagnenübersicht gibt es nicht mehr (Paket 30, T-124): Kanzlei-Kampagnen stehen beim
// Kunden, Lead-Kampagnen in Einstellungen > Lead-Anbindung. Alte Links führen zu den Kunden.
export default function CampaignsPage() {
  redirect("/dashboard/clients")
}
