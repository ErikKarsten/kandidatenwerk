import { expect, test } from "@playwright/test"
import { expectNoHorizontalScroll } from "./helpers"

// Ohne Login, nur lesend - auch gegen Live unbedenklich.
test("Login-Seite lädt", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByLabel("E-Mail")).toBeVisible()
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("Link „Passwort vergessen?“ führt zur Reset-Seite", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("link", { name: "Passwort vergessen?" }).click()
  await expect(page.getByRole("heading", { name: "Passwort vergessen" })).toBeVisible()
})

for (const path of ["/dashboard", "/dashboard/candidates", "/portal", "/lebenslauf/00000000-0000-0000-0000-000000000000"]) {
  test(`${path} ohne Login leitet zum Login um`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login/)
  })
}

test("falsches Passwort wird abgelehnt", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("E-Mail").fill("niemand@example.com")
  await page.getByLabel("Passwort", { exact: true }).fill("falsch-falsch")
  await page.getByRole("button", { name: "Anmelden" }).click()
  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator("form p").first()).toBeVisible()
})

test("Health-Check antwortet ohne Daten", async ({ request }) => {
  const res = await request.get("/api/health")
  const body = await res.json()
  expect(Object.keys(body).sort()).toEqual(["checks", "ok"])
})

test("Cron-Routen ohne Secret gesperrt", async ({ request }) => {
  const res = await request.post("/api/cron/run-automations")
  expect(res.status()).toBe(401)
})
