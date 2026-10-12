import { findPasswordLink } from "@/lib/password-link"
import { SetPasswordFromLinkForm } from "./form"

export const metadata = { title: "Passwort festlegen – Kandidatenwerk" }

// Eigener Link zum Passwort-Setzen (Paket 55): bloßes Öffnen verbraucht ihn nicht, erst das
// Speichern. Ohne Ablaufzeit; ein neu erzeugter Link ersetzt den alten.
export default async function PasswortSetzenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = !!(await findPasswordLink(token))
  return <SetPasswordFromLinkForm token={token} valid={valid} />
}
