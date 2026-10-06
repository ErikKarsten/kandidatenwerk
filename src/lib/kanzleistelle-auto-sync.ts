// Automatische Kanzleistelle24-Aktualisierung nach einer Änderung (Paket 16, T-52) - läuft
// per after() erst nach der Antwort, damit das Speichern nicht auf Kanzleistelle24 wartet.
import { after } from "next/server"
import { syncKanzleistelleIfPublished } from "@/lib/kanzleistelle-profile-sync"

export function scheduleKanzleistelleSync(clientId: string): void {
  after(() => syncKanzleistelleIfPublished(clientId))
}
