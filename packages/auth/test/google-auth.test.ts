import { describe, expect, it, mock } from "bun:test"
import {
  buildGoogleOAuthCallbackUrl,
  isGoogleAuthEnabled,
  resolveGoogleSocialProviders,
} from "../src/lib/google-auth"

describe("optional Google OAuth", () => {
  it("does not register the Google provider when both credentials are unset", () => {
    expect(
      resolveGoogleSocialProviders({
        clientId: undefined,
        clientSecret: undefined,
      })
    ).toBeUndefined()
    expect(isGoogleAuthEnabled({})).toBeFalse()
  })

  it("does not register the Google provider when only one credential is set", () => {
    expect(
      resolveGoogleSocialProviders({
        clientId: "client-id.apps.googleusercontent.com",
        clientSecret: "",
      })
    ).toBeUndefined()
    expect(
      resolveGoogleSocialProviders({
        clientId: "  ",
        clientSecret: "secret",
      })
    ).toBeUndefined()
  })

  it("registers Google only when both client id and secret are set", () => {
    expect(
      resolveGoogleSocialProviders({
        clientId: " client-id.apps.googleusercontent.com ",
        clientSecret: " secret ",
      })
    ).toEqual({
      google: {
        clientId: "client-id.apps.googleusercontent.com",
        clientSecret: "secret",
      },
    })
    expect(
      isGoogleAuthEnabled({
        clientId: "client-id.apps.googleusercontent.com",
        clientSecret: "secret",
      })
    ).toBeTrue()
  })

  it("builds the Better Auth Google callback URL from BETTER_AUTH_URL", () => {
    expect(buildGoogleOAuthCallbackUrl("https://crikket.kodegt.com")).toBe(
      "https://crikket.kodegt.com/api/auth/callback/google"
    )
    expect(buildGoogleOAuthCallbackUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/api/auth/callback/google"
    )
  })

  it("does not log when Google is disabled", () => {
    const error = mock(() => undefined)
    const warn = mock(() => undefined)
    const originalError = console.error
    const originalWarn = console.warn
    console.error = error
    console.warn = warn

    try {
      resolveGoogleSocialProviders({})
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      console.error = originalError
      console.warn = originalWarn
    }
  })
})
