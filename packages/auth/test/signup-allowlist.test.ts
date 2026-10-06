import { describe, expect, it } from "bun:test"
import {
  evaluateSignupAccess,
  getSignupRestrictedMessage,
  isSignupAllowlistUnrestricted,
  isSignupEmailOnAllowlist,
} from "../src/lib/signup-allowlist"

const restrictedConfig = {
  allowedDomains: ["locked.example"],
  allowedEmails: ["allowed@example.com"],
}

describe("signup allowlist", () => {
  it("allows an exact email on ALLOWED_SIGNUP_EMAILS", () => {
    const result = evaluateSignupAccess({
      config: restrictedConfig,
      email: "allowed@example.com",
      mode: "create-account",
    })

    expect(result).toEqual({ allowed: true })
  })

  it("rejects an email that is not on either allowlist", () => {
    const result = evaluateSignupAccess({
      config: restrictedConfig,
      email: "other@example.com",
      mode: "create-account",
    })

    expect(result).toEqual({
      allowed: false,
      message:
        "Sign up is restricted. This email address is not allowed to create an account.",
    })
  })

  it("allows signup when the email domain matches ALLOWED_SIGNUP_DOMAINS", () => {
    const result = evaluateSignupAccess({
      config: {
        allowedDomains: ["kodegt.example"],
        allowedEmails: ["owner@example.com"],
      },
      email: "qa@kodegt.example",
      mode: "create-account",
    })

    expect(result).toEqual({ allowed: true })
  })

  it("lets existing accounts sign in even when the email is not on the lists", () => {
    const result = evaluateSignupAccess({
      config: restrictedConfig,
      email: "existing-user@example.com",
      mode: "sign-in",
    })

    expect(result).toEqual({ allowed: true })
  })

  it("matches emails and domains case-insensitively after trimming", () => {
    const config = {
      allowedDomains: ["  Staff.Example  "],
      allowedEmails: ["  Alice@Example.COM  "],
    }

    expect(
      evaluateSignupAccess({
        config,
        email: "alice@example.com",
        mode: "create-account",
      })
    ).toEqual({ allowed: true })

    expect(
      evaluateSignupAccess({
        config,
        email: "  BOB@STAFF.EXAMPLE  ",
        mode: "create-account",
      })
    ).toEqual({ allowed: true })

    expect(
      isSignupEmailOnAllowlist("ALICE@EXAMPLE.COM", {
        allowedDomains: [],
        allowedEmails: ["alice@example.com"],
      })
    ).toBeTrue()
  })

  it("keeps upstream open signup when neither list is set", () => {
    const config = { allowedDomains: [], allowedEmails: [] }

    expect(isSignupAllowlistUnrestricted(config)).toBeTrue()
    expect(
      evaluateSignupAccess({
        config,
        email: "anyone@example.com",
        mode: "create-account",
      })
    ).toEqual({ allowed: true })
  })

  it("treats a * domain as allow-all", () => {
    expect(
      evaluateSignupAccess({
        config: {
          allowedDomains: ["*"],
          allowedEmails: ["only@example.com"],
        },
        email: "other@example.com",
        mode: "create-account",
      })
    ).toEqual({ allowed: true })
  })

  it("allows a pending organization invitation for that exact email", () => {
    const result = evaluateSignupAccess({
      config: restrictedConfig,
      email: "invited@example.com",
      hasPendingOrganizationInvitation: true,
      mode: "create-account",
    })

    expect(result).toEqual({ allowed: true })
  })

  it("keeps the domain-only error when no email allowlist is configured", () => {
    expect(
      getSignupRestrictedMessage({
        allowedDomains: ["kodegt.example", "*"],
        allowedEmails: [],
      })
    ).toBe("Sign up is only available for kodegt.example domains.")
  })
})
