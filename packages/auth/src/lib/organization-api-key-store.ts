import { db } from "@crikket/db"
import { organizationApiKey } from "@crikket/db/schema/organization-api-key"
import { retryOnUniqueViolation } from "@crikket/shared/lib/server/retry-on-unique-violation"
import { and, desc, eq, isNull } from "drizzle-orm"
import type {
  OrganizationApiKeyRecord,
  OrganizationApiKeyStore,
} from "./organization-api-keys"

function toRecord(
  row: typeof organizationApiKey.$inferSelect
): OrganizationApiKeyRecord {
  return {
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    id: row.id,
    keyHash: row.keyHash,
    keyPrefix: row.keyPrefix,
    label: row.label,
    lastUsedAt: row.lastUsedAt,
    organizationId: row.organizationId,
    revokedAt: row.revokedAt,
    scope: row.scope,
    updatedAt: row.updatedAt,
  }
}

export const drizzleOrganizationApiKeyStore: OrganizationApiKeyStore = {
  async findByHash(keyHash) {
    const record = await db.query.organizationApiKey.findFirst({
      where: eq(organizationApiKey.keyHash, keyHash),
    })

    return record ? toRecord(record) : null
  },
  async insert(input) {
    const created = await retryOnUniqueViolation(async () => {
      const [createdRecord] = await db
        .insert(organizationApiKey)
        .values({
          createdBy: input.createdBy,
          id: input.id,
          keyHash: input.keyHash,
          keyPrefix: input.keyPrefix,
          label: input.label,
          organizationId: input.organizationId,
          revokedAt: null,
          scope: input.scope,
        })
        .returning()

      if (!createdRecord) {
        throw new Error("Failed to create organization API key.")
      }

      return toRecord(createdRecord)
    })

    return created
  },
  async listByOrganizationId(organizationId) {
    const records = await db.query.organizationApiKey.findMany({
      where: eq(organizationApiKey.organizationId, organizationId),
      orderBy: [
        desc(organizationApiKey.createdAt),
        desc(organizationApiKey.id),
      ],
    })

    return records.map(toRecord)
  },
  async revoke(input) {
    const [updatedRecord] = await db
      .update(organizationApiKey)
      .set({
        revokedAt: new Date(),
      })
      .where(
        and(
          eq(organizationApiKey.id, input.keyId),
          eq(organizationApiKey.organizationId, input.organizationId),
          isNull(organizationApiKey.revokedAt)
        )
      )
      .returning({
        id: organizationApiKey.id,
      })

    return Boolean(updatedRecord)
  },
  async touchLastUsedAt(input) {
    await db
      .update(organizationApiKey)
      .set({
        lastUsedAt: input.lastUsedAt,
      })
      .where(eq(organizationApiKey.id, input.keyId))
  },
}
