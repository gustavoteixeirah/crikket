import { relations } from "drizzle-orm"
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { organization, user } from "./auth"

export const organizationApiKey = pgTable(
  "organization_api_key",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scope: text("scope").default("read").notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("organization_api_key_key_hash_uidx").on(table.keyHash),
    index("organization_api_key_organizationId_idx").on(table.organizationId),
    index("organization_api_key_revokedAt_idx").on(table.revokedAt),
  ]
)

export const organizationApiKeyRelations = relations(
  organizationApiKey,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationApiKey.organizationId],
      references: [organization.id],
    }),
    creator: one(user, {
      fields: [organizationApiKey.createdBy],
      references: [user.id],
    }),
  })
)
