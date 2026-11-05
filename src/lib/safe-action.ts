import { unstable_rethrow } from "next/navigation"

// Paket 99: Bricht ein Speichern ab (Verbindung weg, Server überlastet, neue Version
// eingespielt), warf die Server-Action bisher einen Fehler. Die Seite zeigte dann nur noch
// "Die Seite konnte nicht geladen werden", und alles Eingetippte war weg. Mit safeAction
// wird daraus eine normale Fehlermeldung am Feld, die Eingabe bleibt stehen.
export const SAVE_FAILED_MESSAGE = "Speichern hat nicht geklappt (Verbindung oder Server). Die Eingabe ist noch da, bitte noch einmal speichern."

export async function safeAction<T>(call: () => Promise<T>, message: string = SAVE_FAILED_MESSAGE): Promise<T | { error: string }> {
  try {
    return await call()
  } catch (err) {
    // Weiterleitungen und "nicht gefunden" von Next nicht verschlucken.
    unstable_rethrow(err)
    console.error("Server-Action fehlgeschlagen:", err)
    return { error: message }
  }
}
