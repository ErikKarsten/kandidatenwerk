// Einmalige Mail an alle hinterlegten Ansprechpartner der Kunden (Paket 71): Umstellung von
// Leadtable auf Kandidatenwerk, persönlicher Link zum Einrichten des Portal-Zugangs,
// Ansprechpartner Steffen Neubert. Je Ansprechpartner (client_contacts mit E-Mail) eine Mail
// mit eigenem Link; ohne Ansprechpartner die Kontakt-E-Mail des Kunden. Fehlt der
// Portal-Zugang, wird er vorher angelegt. Wer seinen Zugang schon eingerichtet hat, bekommt
// nichts.
// Kunden im Projektstatus "Onboarding" bekommen keine Mail - das Portal wird mit ihnen im
// Onboarding gemeinsam durchgegangen (Wunsch 19.10.2026).
//
//   npx tsx scripts/portal-umstellung-mail.ts               Probelauf: Empfängerliste
//   npx tsx scripts/portal-umstellung-mail.ts --vorschau    Mail als HTML-Datei (neuimport/)
//   npx tsx scripts/portal-umstellung-mail.ts --ausfuehren  verschickt (fortsetzbar)
//   npx tsx scripts/portal-umstellung-mail.ts --test=name@firma.de   eine Testmail (Knopf führt zur Anmeldung)
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { emailButton, renderEmailLayout } from "../src/lib/email-layout"
import { sendEmail } from "../src/lib/brevo-mail"
import { createPasswordLink } from "../src/lib/password-link"
import { ensurePortalAccess } from "../src/lib/portal-access"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const EXECUTE = process.argv.includes("--ausfuehren")
const PREVIEW = process.argv.includes("--vorschau")
const TEST_TO = process.argv.find((a) => a.startsWith("--test="))?.slice("--test=".length).trim() || null
const SENT_LOG = path.resolve(__dirname, "../neuimport/umstellung-gesendet.json")
const PREVIEW_FILE = path.resolve(__dirname, "../neuimport/umstellung-vorschau.html")
const LOGIN_URL = "https://kandidatenwerk.kanzleistelle24.de/login"

const CONTACT = { name: "Steffen Neubert", email: "s.neubert@endlich-mitarbeiter.de", phone: "+49 531 387 632 46" }
const SUBJECT = "Neu: Ihre Kandidat:innen ab sofort im Kandidatenwerk-Portal"

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

function mailHtml(link: string, email: string): string {
  const li = (text: string) => `<li style="margin:4px 0;">${text}</li>`
  return renderEmailLayout({
    subtitle: "Kunden-Portal",
    heading: "Ihre Kandidat:innen finden Sie ab sofort hier",
    contentHtml: [
      // Immer "Guten Tag," ohne Namen (Wunsch 19.10.2026).
      `<p style="margin:0;">Guten Tag,</p>`,
      `<p style="margin:12px 0 0;">wir als Endlich Mitarbeiter ändern, wo Sie Ihre Kandidat:innen finden: Statt über Leadtable stellen wir sie Ihnen ab sofort in unserem eigenen Kunden-Portal <strong>Kandidatenwerk</strong> bereit.</p>`,
      `<p style="margin:12px 0 0;">Was das für Sie bedeutet:</p>`,
      `<ul style="margin:6px 0 0;padding-left:20px;">${[
        li("Alle Kandidat:innen, die wir für Sie gewinnen, finden Sie ab sofort in Ihrem Kunden-Portal – mit Profil und Unterlagen."),
        li("Dort geben Sie uns auch direkt Rückmeldung, z.&nbsp;B. wenn ein Vorstellungsgespräch vereinbart ist."),
        li("Wie bisher erhalten Sie eine E-Mail, sobald eine neue Kandidatin oder ein neuer Kandidat für Sie bereitsteht."),
        li("Alles andere bleibt, wie Sie es kennen."),
      ].join("")}</ul>`,
      `<p style="margin:16px 0 0;">Richten Sie Ihren Zugang einmalig über diesen Knopf ein – Sie legen dabei Ihr Passwort fest:</p>`,
      emailButton(link, "Zugang einrichten"),
      `<p style="margin:12px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Danach melden Sie sich jederzeit unter <a href="${LOGIN_URL}" style="color:#1e56a0;">kandidatenwerk.kanzleistelle24.de</a> an. Falls der Knopf nicht funktioniert:<br><a href="${link}" style="color:#1e56a0;word-break:break-all;">${link}</a></p>`,
      `<p style="margin:20px 0 0;">Bei Fragen oder Problemen hilft Ihnen ${CONTACT.name} gerne weiter: <a href="mailto:${CONTACT.email}" style="color:#1e56a0;">${CONTACT.email}</a>, Tel. <a href="tel:${CONTACT.phone.replace(/\s/g, "")}" style="color:#1e56a0;">${CONTACT.phone}</a>. Weitere Fragen besprechen wir gerne auch in unserem nächsten Gespräch.</p>`,
      `<p style="margin:16px 0 0;">Viele Grüße<br>Ihr Team von Endlich Mitarbeiter</p>`,
    ].join(""),
    footerNote: `Diese E-Mail wurde an ${email} gesendet, weil Sie Kunde von Endlich Mitarbeiter sind.`,
    footerSender: "Gesendet von Endlich Mitarbeiter",
  })
}

interface Recipient {
  clientId: string
  clientName: string
  profileId: string | null
  email: string
  name: string | null
}

async function loadRecipients(): Promise<{ recipients: Recipient[]; withoutEmail: string[]; onboarding: string[]; alreadySetUp: number; conflicts: string[] }> {
  const { data: clients, error } = await db.from("clients").select("id, name, active, contact_email, project_phase").order("name")
  if (error) throw new Error(error.message)
  const { data: contacts } = await db.from("client_contacts").select("client_id, name, email")
  const { data: profiles } = await db.from("profiles").select("id, email, client_id, role")
  // Eingerichtet = schon angemeldet oder Passwort-Link genutzt.
  const signedIn = new Set<string>()
  for (let page = 1; ; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    for (const u of data.users) if (u.last_sign_in_at) signedIn.add(u.id)
    if (data.users.length < 1000) break
  }
  const { data: links } = await db.from("password_links").select("user_id").not("used_at", "is", null)
  for (const l of links ?? []) signedIn.add(l.user_id)
  const profileByEmail = new Map((profiles ?? []).filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]))

  const recipients: Recipient[] = []
  const withoutEmail: string[] = []
  const onboarding: string[] = []
  const conflicts: string[] = []
  let alreadySetUp = 0
  for (const c of clients ?? []) {
    if (c.active === false || /^test\b/i.test(c.name)) continue
    if (c.project_phase === "onboarding") {
      onboarding.push(c.name)
      continue
    }
    const people = (contacts ?? [])
      .filter((p) => p.client_id === c.id && p.email?.trim())
      .map((p) => ({ email: p.email!.trim().toLowerCase(), name: p.name?.trim() || null }))
    if (!people.length && c.contact_email?.trim()) people.push({ email: c.contact_email.trim().toLowerCase(), name: null })
    if (!people.length) {
      withoutEmail.push(c.name)
      continue
    }
    const seen = new Set<string>()
    for (const person of people) {
      if (seen.has(person.email)) continue
      seen.add(person.email)
      const profile = profileByEmail.get(person.email)
      if (profile && (profile.role !== "client" || profile.client_id !== c.id)) {
        conflicts.push(`${c.name}: ${person.email} gehört schon ${profile.role === "client" ? "zu einem anderen Kunden" : "zu einem Team-Zugang"}`)
        continue
      }
      if (profile && signedIn.has(profile.id)) {
        alreadySetUp++
        continue
      }
      recipients.push({ clientId: c.id, clientName: c.name, profileId: profile?.id ?? null, email: person.email, name: person.name })
    }
  }
  return { recipients, withoutEmail, onboarding, alreadySetUp, conflicts }
}

async function main() {
  // Testmail: kein persönlicher Link, kein Zugang wird angelegt oder verändert.
  if (TEST_TO) {
    await sendEmail([TEST_TO], `[Test] ${SUBJECT}`, mailHtml(LOGIN_URL, TEST_TO), {
      senderName: "Endlich Mitarbeiter",
      replyTo: { email: CONTACT.email, name: CONTACT.name },
    })
    console.log(`Testmail an ${TEST_TO} verschickt.`)
    return
  }
  if (PREVIEW) {
    fs.writeFileSync(PREVIEW_FILE, mailHtml("https://kandidatenwerk.kanzleistelle24.de/passwort-setzen/BEISPIEL-LINK", "kanzlei@beispiel.de"))
    console.log(`Vorschau: ${PREVIEW_FILE}\nBetreff: ${SUBJECT}`)
    return
  }
  const { recipients, withoutEmail, onboarding, alreadySetUp, conflicts } = await loadRecipients()
  const sent: string[] = fs.existsSync(SENT_LOG) ? JSON.parse(fs.readFileSync(SENT_LOG, "utf8")) : []
  const todo = recipients.filter((r) => !sent.includes(r.email))
  console.log(`MODUS: ${EXECUTE ? "VERSAND" : "Probelauf (verschickt nichts)"}`)
  console.log(`Empfänger (Ansprechpartner): ${recipients.length} bei ${new Set(recipients.map((r) => r.clientId)).size} Kunden, davon schon verschickt: ${recipients.length - todo.length}`)
  console.log(`Davon ohne Portal-Zugang (wird vorher angelegt): ${recipients.filter((r) => !r.profileId).length}`)
  console.log(`Ansprechpartner mit schon eingerichtetem Zugang (bekommen nichts): ${alreadySetUp}`)
  console.log(`Konflikte (bekommen nichts, bitte prüfen): ${conflicts.length}${conflicts.length ? `\n  ${conflicts.join("\n  ")}` : ""}`)
  console.log(`Kunden im Onboarding (bekommen nichts): ${onboarding.length}${onboarding.length ? ` – ${onboarding.join(", ")}` : ""}`)
  console.log(`Kunden ohne E-Mail-Adresse (bekommen nichts): ${withoutEmail.length}${withoutEmail.length ? ` – ${withoutEmail.join(", ")}` : ""}`)
  for (const r of todo) console.log(`  ${r.clientName} → ${r.name ? `${r.name} ` : ""}<${r.email}>${r.profileId ? "" : " (Zugang wird angelegt)"}`)
  if (!EXECUTE) return

  let ok = 0
  for (const r of todo) {
    try {
      let profileId = r.profileId
      if (!profileId) {
        const res = await ensurePortalAccess(r.clientId, r.email)
        if ("error" in res) throw new Error(res.error)
        profileId = res.profileId
      }
      const link = await createPasswordLink(profileId, null)
      await sendEmail([r.email], SUBJECT, mailHtml(link, r.email), {
        senderName: "Endlich Mitarbeiter",
        replyTo: { email: CONTACT.email, name: CONTACT.name },
        // Steffen Neubert in Blindkopie bei jeder Mail (Wunsch 19.10.2026).
        bcc: [CONTACT.email],
      })
      await db.from("profiles").update({ portal_invited_at: new Date().toISOString() }).eq("id", profileId)
      sent.push(r.email)
      fs.writeFileSync(SENT_LOG, JSON.stringify(sent, null, 1))
      ok++
      console.log(`✓ ${r.clientName} → ${r.email}`)
    } catch (err) {
      console.error(`✗ ${r.clientName} → ${r.email}: ${err instanceof Error ? err.message : err}`)
    }
    await new Promise((res) => setTimeout(res, 400))
  }
  console.log(`Fertig: ${ok} von ${todo.length} verschickt.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
