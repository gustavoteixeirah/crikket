import { db } from "@crikket/db"
import { member } from "@crikket/db/schema/auth"
import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { drizzleOrganizationApiKeyStore } from "../lib/organization-api-key-store"
import {
  createOrganizationApiKey,
  listOrganizationApiKeys,
  type OrganizationApiKeyPublicRecord,
  revokeOrganizationApiKey,
} from "../lib/organization-api-keys"
import { protectedProcedure, type SessionContext } from "./context"

const createOrganizationApiKeyInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
})

const organizationApiKeyIdSchema = z.object({
  keyId: z.string().min(1),
})

function serializeOrganizationApiKey(record: OrganizationApiKeyPublicRecord) {
  return {
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
    id: record.id,
    keyPrefix: record.keyPrefix,
    label: record.label,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    organizationId: record.organizationId,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    scope: record.scope,
    updatedAt: record.updatedAt.toISOString(),
  }
}

async function requireActiveOrgAdmin(session: SessionContext): Promise<string> {
  const activeOrgId = session.session.activeOrganizationId
  if (!activeOrgId) {
    throw new ORPCError("BAD_REQUEST", { message: "No active organization" })
  }

  const activeMember = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, activeOrgId),
      eq(member.userId, session.user.id)
    ),
    columns: {
      role: true,
    },
  })

  if (
    !(
      activeMember &&
      (activeMember.role === "owner" || activeMember.role === "admin")
    )
  ) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only organization admins or owners can manage API keys.",
    })
  }

  return activeOrgId
}

export const listOrganizationApiKeysProcedure = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)
    const records = await listOrganizationApiKeys(
      { organizationId },
      drizzleOrganizationApiKeyStore
    )

    return records.map(serializeOrganizationApiKey)
  }
)

export const createOrganizationApiKeyProcedure = protectedProcedure
  .input(createOrganizationApiKeyInputSchema)
  .handler(async ({ context, input }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const record = await createOrganizationApiKey(
        {
          createdBy: context.session.user.id,
          label: input.label,
          organizationId,
        },
        drizzleOrganizationApiKeyStore
      )

      return {
        ...serializeOrganizationApiKey(record),
        key: record.key,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : null
      if (message) {
        throw new ORPCError("BAD_REQUEST", { message })
      }

      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to create organization API key.",
      })
    }
  })

export const revokeOrganizationApiKeyProcedure = protectedProcedure
  .input(organizationApiKeyIdSchema)
  .handler(async ({ context, input }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)
    const revoked = await revokeOrganizationApiKey(
      {
        keyId: input.keyId,
        organizationId,
      },
      drizzleOrganizationApiKeyStore
    )

    if (!revoked) {
      throw new ORPCError("NOT_FOUND", {
        message: "API key not found.",
      })
    }

    return { success: true }
  })
