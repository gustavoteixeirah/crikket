import { ORPCError } from "@orpc/server"
import { z } from "zod"

import { isOrganizationMember } from "../lib/active-organization"
import {
  applySessionActiveOrganization,
  listUserOrganizationMemberships,
  setPreferredOrganizationId,
} from "../lib/organization-preference"
import { protectedProcedure } from "./context"

const setPreferredOrganizationInputSchema = z.object({
  organizationId: z.string().min(1),
})

function serializeMembership(membership: {
  createdAt: Date
  logo: string | null
  name: string
  organizationId: string
  role: string
  slug: string
}) {
  return {
    createdAt: membership.createdAt.toISOString(),
    id: membership.organizationId,
    logo: membership.logo,
    name: membership.name,
    role: membership.role,
    slug: membership.slug,
  }
}

export const getMyOrganizationsProcedure = protectedProcedure.handler(
  async ({ context }) => {
    const resolved = await applySessionActiveOrganization({
      currentActiveOrganizationId: context.session.session.activeOrganizationId,
      sessionId: context.session.session.id,
      userId: context.session.user.id,
    })

    if (resolved.activeOrganizationId) {
      context.session.session.activeOrganizationId =
        resolved.activeOrganizationId
    }

    return {
      activeOrganizationId: resolved.activeOrganizationId,
      organizations: resolved.memberships.map(serializeMembership),
      preferredOrganizationId: resolved.preferredOrganizationId,
    }
  }
)

export const setPreferredOrganizationProcedure = protectedProcedure
  .input(setPreferredOrganizationInputSchema)
  .handler(async ({ context, input }) => {
    const memberships = await listUserOrganizationMemberships(
      context.session.user.id
    )

    if (!isOrganizationMember(input.organizationId, memberships)) {
      throw new ORPCError("FORBIDDEN", {
        message: "You are not a member of the selected organization.",
      })
    }

    await setPreferredOrganizationId({
      organizationId: input.organizationId,
      userId: context.session.user.id,
    })

    const resolved = await applySessionActiveOrganization({
      currentActiveOrganizationId: input.organizationId,
      sessionId: context.session.session.id,
      userId: context.session.user.id,
    })

    context.session.session.activeOrganizationId = input.organizationId

    return {
      activeOrganizationId: resolved.activeOrganizationId,
      organizations: resolved.memberships.map(serializeMembership),
      preferredOrganizationId: resolved.preferredOrganizationId,
    }
  })
