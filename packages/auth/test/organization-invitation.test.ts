import { describe, expect, it } from "bun:test"
import {
  buildOrganizationInvitationUrl,
  canManageOrganizationMembers,
  evaluateAddExistingMember,
  resolveInvitationView,
} from "@crikket/shared/lib/organization-invitation"

import {
  executeAuthEmailSend,
  resolveAuthEmailDelivery,
} from "../src/lib/auth-email-delivery"
import { resolveGoogleSocialProviders } from "../src/lib/google-auth"

const pendingInvitation = {
  id: "inv_123",
  email: "Invited@Example.com",
  role: "admin",
  status: "pending",
  expiresAt: "2026-10-07T12:00:00.000Z",
  organizationName: "kode-gt",
}

describe("auth email delivery for invitations", () => {
  it("skips invitation email when Resend is not configured instead of erroring", () => {
    expect(
      resolveAuthEmailDelivery({
        hasApiKey: false,
        hasFromEmail: false,
        nodeEnv: "production",
        requireDelivery: false,
      })
    ).toEqual({
      action: "skip",
      reason: "Missing RESEND_API_KEY",
    })
  })

  it("still sends invitation email when Resend is fully configured", () => {
    expect(
      resolveAuthEmailDelivery({
        hasApiKey: true,
        hasFromEmail: true,
        nodeEnv: "production",
        requireDelivery: false,
      })
    ).toEqual({ action: "send" })
  })

  it("keeps OTP and verification emails failing in production without Resend", () => {
    expect(
      resolveAuthEmailDelivery({
        hasApiKey: false,
        hasFromEmail: false,
        nodeEnv: "production",
        requireDelivery: true,
      })
    ).toEqual({
      action: "error",
      message:
        "Missing RESEND_API_KEY. Set RESEND_API_KEY in apps/server/.env.",
    })
  })

  it("warns and skips required emails in development without Resend", () => {
    expect(
      resolveAuthEmailDelivery({
        hasApiKey: false,
        hasFromEmail: true,
        nodeEnv: "development",
        requireDelivery: true,
      })
    ).toEqual({
      action: "skip",
      reason: "Missing RESEND_API_KEY",
    })
  })

  it("keeps invites working when Google and Resend flags are both off", () => {
    expect(resolveGoogleSocialProviders({})).toBeUndefined()
    expect(
      resolveAuthEmailDelivery({
        hasApiKey: false,
        hasFromEmail: false,
        nodeEnv: "production",
        requireDelivery: false,
      })
    ).toEqual({
      action: "skip",
      reason: "Missing RESEND_API_KEY",
    })
    expect(
      buildOrganizationInvitationUrl("https://crikket.kodegt.com", "inv_123")
    ).toBe("https://crikket.kodegt.com/invite/inv_123")
  })

  it("swallows Resend send failures for optional invitation email and logs them", async () => {
    const logged: Array<{ message: string; error: unknown }> = []

    const result = await executeAuthEmailSend({
      requireDelivery: false,
      to: "invited@example.com",
      logger: {
        error(message, error) {
          logged.push({ message, error })
        },
      },
      send: () =>
        Promise.reject(new Error("Failed to send auth email: rate limited")),
    })

    expect(result).toEqual({ delivered: false })
    expect(logged).toHaveLength(1)
    expect(logged[0]?.message).toContain("invited@example.com")
    expect(logged[0]?.error).toBeInstanceOf(Error)
  })

  it("still throws Resend failures when delivery is required", async () => {
    await expect(
      executeAuthEmailSend({
        requireDelivery: true,
        to: "user@example.com",
        send: () =>
          Promise.reject(new Error("Failed to send auth email: rate limited")),
      })
    ).rejects.toThrow("Failed to send auth email: rate limited")
  })
})

describe("organization invitation accept states", () => {
  it("builds a copyable invite link from the app origin and invitation id", () => {
    expect(
      buildOrganizationInvitationUrl("https://crikket.kodegt.com", "inv_123")
    ).toBe("https://crikket.kodegt.com/invite/inv_123")
  })

  it("lets a logged-in user accept when the session email matches", () => {
    expect(
      resolveInvitationView({
        invitation: pendingInvitation,
        sessionEmail: "invited@example.com",
        now: new Date("2026-10-06T12:00:00.000Z"),
      })
    ).toEqual({
      kind: "can-accept",
      invitedEmail: "invited@example.com",
      organizationName: "kode-gt",
      role: "admin",
    })
  })

  it("asks a signed-out invitee to create an account for the invited email", () => {
    expect(
      resolveInvitationView({
        invitation: pendingInvitation,
        sessionEmail: null,
        now: new Date("2026-10-06T12:00:00.000Z"),
      })
    ).toEqual({
      kind: "needs-account",
      invitedEmail: "invited@example.com",
      organizationName: "kode-gt",
      role: "admin",
    })
  })

  it("rejects a session signed in with a different email", () => {
    expect(
      resolveInvitationView({
        invitation: pendingInvitation,
        sessionEmail: "other@example.com",
        now: new Date("2026-10-06T12:00:00.000Z"),
      })
    ).toEqual({
      kind: "wrong-email",
      invitedEmail: "invited@example.com",
      sessionEmail: "other@example.com",
      organizationName: "kode-gt",
      role: "admin",
    })
  })

  it("treats an unexpired clock edge as expired once expiresAt is reached", () => {
    expect(
      resolveInvitationView({
        invitation: pendingInvitation,
        sessionEmail: "invited@example.com",
        now: new Date("2026-10-07T12:00:00.000Z"),
      })
    ).toEqual({
      kind: "expired",
      organizationName: "kode-gt",
      invitedEmail: "invited@example.com",
    })
  })

  it("does not allow accept or signup after the invitation is canceled", () => {
    expect(
      resolveInvitationView({
        invitation: { ...pendingInvitation, status: "canceled" },
        sessionEmail: null,
        now: new Date("2026-10-06T12:00:00.000Z"),
      })
    ).toEqual({ kind: "canceled" })
  })

  it("returns not-found when the invitation id does not exist", () => {
    expect(
      resolveInvitationView({
        invitation: null,
        sessionEmail: null,
      })
    ).toEqual({ kind: "not-found" })
  })
})

describe("organization member role permissions", () => {
  it("allows owners and admins to manage members, but not members", () => {
    expect(canManageOrganizationMembers("owner")).toBeTrue()
    expect(canManageOrganizationMembers("admin")).toBeTrue()
    expect(canManageOrganizationMembers("member")).toBeFalse()
  })

  it("lets an admin add an existing user as a member", () => {
    expect(
      evaluateAddExistingMember({
        actorRole: "admin",
        targetRole: "member",
        userExists: true,
        alreadyMember: false,
      })
    ).toEqual({ allowed: true })
  })

  it("forbids members from adding anyone", () => {
    expect(
      evaluateAddExistingMember({
        actorRole: "member",
        targetRole: "member",
        userExists: true,
        alreadyMember: false,
      })
    ).toEqual({
      allowed: false,
      code: "FORBIDDEN",
      message: "Only organization owners and admins can add members.",
    })
  })

  it("tells admins to create an invite when no account exists", () => {
    expect(
      evaluateAddExistingMember({
        actorRole: "owner",
        targetRole: "admin",
        userExists: false,
        alreadyMember: false,
      })
    ).toEqual({
      allowed: false,
      code: "NOT_FOUND",
      message:
        "No account exists for that email. Create an invite and share the link instead.",
    })
  })

  it("rejects roles other than admin or member", () => {
    expect(
      evaluateAddExistingMember({
        actorRole: "owner",
        targetRole: "owner",
        userExists: true,
        alreadyMember: false,
      })
    ).toEqual({
      allowed: false,
      code: "BAD_REQUEST",
      message: "You can only add members with the admin or member role.",
    })
  })

  it("rejects adding a user who is already in the organization", () => {
    expect(
      evaluateAddExistingMember({
        actorRole: "owner",
        targetRole: "member",
        userExists: true,
        alreadyMember: true,
      })
    ).toEqual({
      allowed: false,
      code: "CONFLICT",
      message: "That user is already a member of this organization.",
    })
  })
})
