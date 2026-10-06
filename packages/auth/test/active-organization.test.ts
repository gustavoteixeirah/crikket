import { describe, expect, it } from "bun:test"

import {
  resolveIngestOrganizationId,
  resolvePreferredActiveOrganizationId,
  resolveSessionActiveOrganizationId,
  shouldPersistSingleMembershipPreferred,
  shouldPromptForDefaultOrganization,
} from "../src/lib/active-organization"

const kodeGt = {
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  organizationId: "org_kodegt",
}
const ownedPersonal = {
  createdAt: new Date("2025-12-01T00:00:00.000Z"),
  organizationId: "org_owned",
}
const laterMembership = {
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  organizationId: "org_later",
}

describe("session active organization resolution", () => {
  it("uses the preferred organization when the user is a member", () => {
    expect(
      resolvePreferredActiveOrganizationId({
        memberships: [ownedPersonal, kodeGt],
        preferredOrganizationId: "org_kodegt",
      })
    ).toBe("org_kodegt")
  })

  it("ignores a preferred organization the user is not a member of", () => {
    expect(
      resolvePreferredActiveOrganizationId({
        memberships: [kodeGt],
        preferredOrganizationId: "org_owned",
      })
    ).toBe("org_kodegt")
  })

  it("uses the only membership when there is no preferred organization", () => {
    expect(
      resolvePreferredActiveOrganizationId({
        memberships: [kodeGt],
        preferredOrganizationId: null,
      })
    ).toBe("org_kodegt")
  })

  it("falls back to the oldest membership, not an owned org outside memberships", () => {
    expect(
      resolvePreferredActiveOrganizationId({
        memberships: [kodeGt, laterMembership],
        preferredOrganizationId: null,
      })
    ).toBe("org_kodegt")
  })

  it("keeps a valid session active org even when preferred differs", () => {
    expect(
      resolveSessionActiveOrganizationId({
        currentActiveOrganizationId: "org_kodegt",
        memberships: [ownedPersonal, kodeGt],
        preferredOrganizationId: "org_owned",
      })
    ).toBe("org_kodegt")
  })

  it("replaces a session active org the user is not a member of", () => {
    expect(
      resolveSessionActiveOrganizationId({
        currentActiveOrganizationId: "org_foreign",
        memberships: [ownedPersonal, kodeGt],
        preferredOrganizationId: "org_kodegt",
      })
    ).toBe("org_kodegt")
  })

  it("returns null when the user has no memberships", () => {
    expect(
      resolvePreferredActiveOrganizationId({
        memberships: [],
        preferredOrganizationId: "org_owned",
      })
    ).toBeNull()
  })
})

describe("default organization prompts", () => {
  it("prompts once when the user has multiple orgs and no valid default", () => {
    expect(
      shouldPromptForDefaultOrganization({
        memberships: [ownedPersonal, kodeGt],
        preferredOrganizationId: null,
      })
    ).toBe(true)
  })

  it("does not prompt when a valid default exists", () => {
    expect(
      shouldPromptForDefaultOrganization({
        memberships: [ownedPersonal, kodeGt],
        preferredOrganizationId: "org_kodegt",
      })
    ).toBe(false)
  })

  it("persists a default automatically for a single membership", () => {
    expect(
      shouldPersistSingleMembershipPreferred({
        memberships: [kodeGt],
        preferredOrganizationId: null,
      })
    ).toBe(true)
  })
})

describe("report ingest organization resolution", () => {
  it("sends to the explicitly chosen org when the user is a member of several", () => {
    expect(
      resolveIngestOrganizationId({
        explicitOrganizationId: "org_kodegt",
        membershipOrganizationIds: ["org_owned", "org_kodegt"],
        sessionActiveOrganizationId: "org_owned",
      })
    ).toEqual({
      ok: true,
      organizationId: "org_kodegt",
      source: "explicit",
    })
  })

  it("does not fall back to the owner org when the chosen org is not a membership", () => {
    expect(
      resolveIngestOrganizationId({
        explicitOrganizationId: "org_kodegt",
        membershipOrganizationIds: ["org_owned"],
        sessionActiveOrganizationId: "org_owned",
      })
    ).toEqual({
      ok: false,
      code: "not_a_member",
    })
  })

  it("uses the session active org when no explicit org is chosen", () => {
    expect(
      resolveIngestOrganizationId({
        explicitOrganizationId: null,
        membershipOrganizationIds: ["org_owned", "org_kodegt"],
        sessionActiveOrganizationId: "org_kodegt",
      })
    ).toEqual({
      ok: true,
      organizationId: "org_kodegt",
      source: "session",
    })
  })

  it("does not invent an owner-org fallback when session and explicit org are missing", () => {
    expect(
      resolveIngestOrganizationId({
        explicitOrganizationId: null,
        membershipOrganizationIds: ["org_owned", "org_kodegt"],
        sessionActiveOrganizationId: null,
      })
    ).toEqual({
      ok: false,
      code: "no_organization",
    })
  })

  it("rejects a session active org the user is not a member of", () => {
    expect(
      resolveIngestOrganizationId({
        explicitOrganizationId: null,
        membershipOrganizationIds: ["org_kodegt"],
        sessionActiveOrganizationId: "org_owned",
      })
    ).toEqual({
      ok: false,
      code: "no_organization",
    })
  })
})
