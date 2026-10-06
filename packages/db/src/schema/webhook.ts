import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { organization, user } from "./auth"

export const organizationWebhookEndpoint = pgTable(
  "organization_webhook_endpoint",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secretEncrypted: text("secret_encrypted").notNull(),
    secretLastFour: text("secret_last_four").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("organization_webhook_endpoint_organizationId_uidx").on(
      table.organizationId
    ),
  ]
)

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => organizationWebhookEndpoint.id, {
        onDelete: "cascade",
      }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    destinationUrl: text("destination_url").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    status: text("status").default("pending").notNull(),
    httpStatus: integer("http_status"),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("webhook_delivery_idempotency_uidx").on(
      table.endpointId,
      table.eventType,
      table.sourceId
    ),
    index("webhook_delivery_organizationId_idx").on(table.organizationId),
    index("webhook_delivery_status_idx").on(table.status),
    index("webhook_delivery_nextAttemptAt_idx").on(table.nextAttemptAt),
    index("webhook_delivery_endpointId_createdAt_idx").on(
      table.endpointId,
      table.createdAt
    ),
  ]
)

export const organizationWebhookEndpointRelations = relations(
  organizationWebhookEndpoint,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [organizationWebhookEndpoint.organizationId],
      references: [organization.id],
    }),
    creator: one(user, {
      fields: [organizationWebhookEndpoint.createdBy],
      references: [user.id],
    }),
    deliveries: many(webhookDelivery),
  })
)

export const webhookDeliveryRelations = relations(
  webhookDelivery,
  ({ one }) => ({
    endpoint: one(organizationWebhookEndpoint, {
      fields: [webhookDelivery.endpointId],
      references: [organizationWebhookEndpoint.id],
    }),
    organization: one(organization, {
      fields: [webhookDelivery.organizationId],
      references: [organization.id],
    }),
  })
)
