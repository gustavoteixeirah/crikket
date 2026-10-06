import { auth } from "@crikket/auth"
import { applySessionActiveOrganization } from "@crikket/auth/lib/organization-preference"
import type { Context as HonoContext } from "hono"

export type CreateContextOptions = {
  context: HonoContext
}

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  })

  const sessionId = session?.session.id
  const userId = session?.user.id

  if (session && userId) {
    const resolved = await applySessionActiveOrganization({
      currentActiveOrganizationId: session.session.activeOrganizationId,
      sessionId,
      userId,
    })

    session.session.activeOrganizationId =
      resolved.activeOrganizationId ?? undefined
  }

  return {
    session: session ?? undefined,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
