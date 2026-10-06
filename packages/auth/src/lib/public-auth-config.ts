import { env } from "@crikket/env/server"

import { isAuthEmailConfigured } from "./email/send-auth-email"
import { isGoogleAuthEnabled } from "./google-auth"

export type PublicAuthConfig = {
  googleAuthEnabled: boolean
  invitationEmailEnabled: boolean
}

export function getPublicAuthConfig(): PublicAuthConfig {
  return {
    googleAuthEnabled: isGoogleAuthEnabled({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
    invitationEmailEnabled: isAuthEmailConfigured(),
  }
}
