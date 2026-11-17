import { describe, expect, it } from "vitest"
import { isTransientFailure } from "@/lib/bug-reports/system-reports"

describe("isTransientFailure", () => {
  it("erkennt vorübergehende Störungen fremder Dienste", () => {
    expect(
      isTransientFailure(
        'Meta-Graph-API-Fehler (400) bei /act_1/adsets: {"error":{"message":"User request limit reached","type":"OAuthException","is_transient":false,"code":17}}'
      )
    ).toBe(true)
    expect(isTransientFailure('1× Meta-Graph-API-Fehler (429) bei /…/leads: {"error":{"type":"TooManyRequestsException"}}')).toBe(true)
    expect(isTransientFailure("Close-API 524: error code: 524")).toBe(true)
    expect(isTransientFailure("1× ab60d68d: kie.ai 500: Internal error, please try again later")).toBe(true)
  })

  it("meldet echte Fehler weiter sofort", () => {
    expect(isTransientFailure("META_AD_ACCOUNT_ID ist nicht gesetzt.")).toBe(false)
    expect(isTransientFailure('Meta-Graph-API-Fehler (400) bei /x: {"error":{"message":"Invalid OAuth access token","code":190}}')).toBe(false)
    expect(isTransientFailure("")).toBe(false)
    // Gemischt: eine echte Fehlerzeile genügt.
    expect(isTransientFailure("2× Close-API 524: error code: 524\n1× column foo does not exist")).toBe(false)
  })
})
