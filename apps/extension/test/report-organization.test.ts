import { describe, expect, it } from "bun:test"

import { pickReportOrganizationId } from "../lib/report-organization"

describe("pickReportOrganizationId", () => {
  const membershipIds = ["org_owned", "org_kodegt"]

  it("prefers the stored choice when it is still a membership", () => {
    expect(
      pickReportOrganizationId({
        activeOrganizationId: "org_owned",
        membershipIds,
        preferredOrganizationId: "org_owned",
        storedOrganizationId: "org_kodegt",
      })
    ).toBe("org_kodegt")
  })

  it("ignores a stored org the user is not a member of", () => {
    expect(
      pickReportOrganizationId({
        activeOrganizationId: "org_kodegt",
        membershipIds: ["org_kodegt"],
        preferredOrganizationId: "org_kodegt",
        storedOrganizationId: "org_owned",
      })
    ).toBe("org_kodegt")
  })

  it("falls back to preferred, then active, then first membership", () => {
    expect(
      pickReportOrganizationId({
        activeOrganizationId: "org_owned",
        membershipIds,
        preferredOrganizationId: "org_kodegt",
        storedOrganizationId: null,
      })
    ).toBe("org_kodegt")

    expect(
      pickReportOrganizationId({
        activeOrganizationId: "org_kodegt",
        membershipIds,
        preferredOrganizationId: null,
        storedOrganizationId: null,
      })
    ).toBe("org_kodegt")

    expect(
      pickReportOrganizationId({
        activeOrganizationId: null,
        membershipIds,
        preferredOrganizationId: null,
        storedOrganizationId: null,
      })
    ).toBe("org_owned")
  })
})
