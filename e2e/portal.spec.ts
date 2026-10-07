import { expect, test } from "@playwright/test"
import { expectNoHorizontalScroll, login, portal } from "./helpers"

// Mit Kanzlei-Login - nur auf Staging (E2E_PORTAL_EMAIL/E2E_PORTAL_PASSWORD).
test.skip(!portal.email || !portal.password, "E2E_PORTAL_* nicht gesetzt")

test.beforeEach(async ({ page }) => {
  await login(page, portal.email!, portal.password!)
})

test("Kanzlei landet im Portal", async ({ page }) => {
  await expect(page).toHaveURL(/\/portal/)
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test("Dashboard ist für Kanzlei gesperrt", async ({ page }) => {
  await page.goto("/dashboard/candidates")
  await expect(page).toHaveURL(/\/portal/)
})

test("Lebenslauf-Export ist für Kanzlei gesperrt", async ({ page }) => {
  await page.goto("/lebenslauf/00000000-0000-0000-0000-000000000000")
  await expect(page).not.toHaveURL(/\/lebenslauf/)
})

test("nur vorqualifizierte Kandidaten sichtbar", async ({ page }) => {
  await page.goto("/portal/candidates")
  // Testdaten (staging-seed.ts): Anna ist neu, Clara in Kontakt - beide nie im Portal.
  await expect(page.getByText("Anna Neu")).toHaveCount(0)
  await expect(page.getByText("Clara Kontakt")).toHaveCount(0)
})

test("fremde Kandidaten-ID ergibt 404", async ({ page }) => {
  const res = await page.goto("/portal/candidates/00000000-0000-0000-0000-000000000000")
  expect(res?.status()).toBe(404)
})
