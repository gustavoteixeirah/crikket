export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/callback/google"

export function isGoogleAuthEnabled(input: {
  clientId?: string
  clientSecret?: string
}): boolean {
  return resolveGoogleSocialProviders(input) != null
}

export function resolveGoogleSocialProviders(input: {
  clientId?: string
  clientSecret?: string
}):
  | {
      google: {
        clientId: string
        clientSecret: string
      }
    }
  | undefined {
  const clientId = input.clientId?.trim() ?? ""
  const clientSecret = input.clientSecret?.trim() ?? ""

  if (!(clientId && clientSecret)) {
    return undefined
  }

  return {
    google: {
      clientId,
      clientSecret,
    },
  }
}

export function buildGoogleOAuthCallbackUrl(baseUrl: string): string {
  return new URL(GOOGLE_OAUTH_CALLBACK_PATH, baseUrl).toString()
}
