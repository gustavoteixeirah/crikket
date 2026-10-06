import { client } from "@/utils/orpc"

export type PublicAuthConfig = {
  googleAuthEnabled: boolean
  invitationEmailEnabled: boolean
}

const disabledPublicAuthConfig: PublicAuthConfig = {
  googleAuthEnabled: false,
  invitationEmailEnabled: false,
}

export async function loadPublicAuthConfig(): Promise<PublicAuthConfig> {
  try {
    return await client.auth.getPublicAuthConfig()
  } catch {
    return disabledPublicAuthConfig
  }
}
