import { assertOrganizationCanAddMembers } from "@crikket/billing/service/entitlements/organization-entitlements"
import { db } from "@crikket/db"
import { invitation, member, user } from "@crikket/db/schema/auth"
import { evaluateAddExistingMember } from "@crikket/shared/lib/organization-invitation"
import { ORPCError } from "@orpc/server"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { auth } from "../index"
import { getPublicAuthConfig } from "../lib/public-auth-config"
import { protectedProcedure, publicProcedure } from "./context"

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

export const getPublicAuthConfigProcedure = publicProcedure.handler(() =>
  getPublicAuthConfig()
)

export const getAuthEmailDeliveryStatusProcedure = getPublicAuthConfigProcedure

export const getOrganizationInvitationProcedure = publicProcedure
  .input(
    z.object({
      invitationId: z.string().min(1),
    })
  )
  .handler(async ({ input }) => {
    const row = await db.query.invitation.findFirst({
      where: eq(invitation.id, input.invitationId),
      columns: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        organizationId: true,
      },
      with: {
        organization: {
          columns: {
            name: true,
          },
        },
      },
    })

    if (!row) {
      return null
    }

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: toIsoString(row.expiresAt),
      organizationId: row.organizationId,
      organizationName: row.organization.name,
    }
  })

export const addExistingOrganizationMemberProcedure = protectedProcedure
  .input(
    z.object({
      organizationId: z.string().min(1),
      email: z.email(),
      role: z.enum(["admin", "member"]),
    })
  )
  .handler(async ({ context, input }) => {
    const membership = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, input.organizationId),
        eq(member.userId, context.session.user.id)
      ),
      columns: {
        role: true,
      },
    })

    const normalizedEmail = input.email.trim().toLowerCase()
    const existingUser = await db.query.user.findFirst({
      where: sql`lower(${user.email}) = ${normalizedEmail}`,
      columns: {
        id: true,
      },
    })

    const alreadyMember = existingUser
      ? Boolean(
          await db.query.member.findFirst({
            where: and(
              eq(member.organizationId, input.organizationId),
              eq(member.userId, existingUser.id)
            ),
            columns: {
              id: true,
            },
          })
        )
      : false

    const decision = evaluateAddExistingMember({
      actorRole: membership?.role ?? "member",
      alreadyMember,
      targetRole: input.role,
      userExists: existingUser != null,
    })

    if (!decision.allowed) {
      const status =
        decision.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : decision.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : decision.code === "CONFLICT"
              ? "CONFLICT"
              : "BAD_REQUEST"
      throw new ORPCError(status, { message: decision.message })
    }

    if (!existingUser) {
      throw new ORPCError("NOT_FOUND", {
        message:
          "No account exists for that email. Create an invite and share the link instead.",
      })
    }

    await assertOrganizationCanAddMembers(input.organizationId)

    try {
      await auth.api.addMember({
        body: {
          organizationId: input.organizationId,
          role: input.role,
          userId: existingUser.id,
        },
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add member."
      throw new ORPCError("BAD_REQUEST", { message })
    }

    await db
      .update(invitation)
      .set({ status: "canceled" })
      .where(
        and(
          eq(invitation.organizationId, input.organizationId),
          eq(invitation.status, "pending"),
          sql`lower(${invitation.email}) = ${normalizedEmail}`
        )
      )

    return {
      added: true as const,
      userId: existingUser.id,
    }
  })
