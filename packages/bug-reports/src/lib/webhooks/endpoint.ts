import { db } from "@crikket/db"
import { organizationWebhookEndpoint } from "@crikket/db/schema/webhook"
import { env } from "@crikket/env/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { isWebhookPrivateUrlAllowed } from "./app-url"
import {
  decryptWebhookSecret,
  deriveWebhookEncryptionKey,
  encryptWebhookSecret,
  generateWebhookSigningSecret,
  maskWebhookSecret,
  webhookSecretLastFour,
} from "./secret"
import { assertWebhookDestinationAllowed } from "./ssrf"

export interface OrganizationWebhookEndpointView {
  createdAt: string
  enabled: boolean
  id: string
  maskedSecret: string
  secretLastFour: string
  updatedAt: string
  url: string
}

export interface OrganizationWebhookEndpointWithSecret
  extends OrganizationWebhookEndpointView {
  secret: string
}

function getWebhookEncryptionKey(): Buffer {
  return deriveWebhookEncryptionKey(env.BETTER_AUTH_SECRET)
}

function toEndpointView(row: {
  createdAt: Date
  enabled: boolean
  id: string
  secretLastFour: string
  updatedAt: Date
  url: string
}): OrganizationWebhookEndpointView {
  return {
    createdAt: row.createdAt.toISOString(),
    enabled: row.enabled,
    id: row.id,
    maskedSecret: maskWebhookSecret(row.secretLastFour),
    secretLastFour: row.secretLastFour,
    updatedAt: row.updatedAt.toISOString(),
    url: row.url,
  }
}

export async function getOrganizationWebhookEndpoint(input: {
  organizationId: string
}): Promise<OrganizationWebhookEndpointView | null> {
  const row = await db.query.organizationWebhookEndpoint.findFirst({
    where: eq(organizationWebhookEndpoint.organizationId, input.organizationId),
  })

  return row ? toEndpointView(row) : null
}

export async function upsertOrganizationWebhookEndpoint(input: {
  createdBy: string
  enabled: boolean
  organizationId: string
  url: string
}): Promise<OrganizationWebhookEndpointWithSecret> {
  await assertWebhookDestinationAllowed(input.url, {
    allowPrivate: isWebhookPrivateUrlAllowed(),
  })

  const existing = await db.query.organizationWebhookEndpoint.findFirst({
    where: eq(organizationWebhookEndpoint.organizationId, input.organizationId),
  })

  if (existing) {
    const [updated] = await db
      .update(organizationWebhookEndpoint)
      .set({
        enabled: input.enabled,
        url: input.url,
        updatedAt: new Date(),
      })
      .where(eq(organizationWebhookEndpoint.id, existing.id))
      .returning()

    if (!updated) {
      throw new Error("Failed to update webhook endpoint.")
    }

    return {
      ...toEndpointView(updated),
      secret: "",
    }
  }

  const secret = generateWebhookSigningSecret()
  const [created] = await db
    .insert(organizationWebhookEndpoint)
    .values({
      createdBy: input.createdBy,
      enabled: input.enabled,
      id: nanoid(16),
      organizationId: input.organizationId,
      secretEncrypted: encryptWebhookSecret({
        encryptionKey: getWebhookEncryptionKey(),
        secret,
      }),
      secretLastFour: webhookSecretLastFour(secret),
      url: input.url,
    })
    .returning()

  if (!created) {
    throw new Error("Failed to create webhook endpoint.")
  }

  return {
    ...toEndpointView(created),
    secret,
  }
}

export async function rotateOrganizationWebhookSecret(input: {
  organizationId: string
}): Promise<OrganizationWebhookEndpointWithSecret> {
  const existing = await requireEndpoint(input.organizationId)
  const secret = generateWebhookSigningSecret()
  const [updated] = await db
    .update(organizationWebhookEndpoint)
    .set({
      secretEncrypted: encryptWebhookSecret({
        encryptionKey: getWebhookEncryptionKey(),
        secret,
      }),
      secretLastFour: webhookSecretLastFour(secret),
      updatedAt: new Date(),
    })
    .where(eq(organizationWebhookEndpoint.id, existing.id))
    .returning()

  if (!updated) {
    throw new Error("Failed to rotate webhook signing secret.")
  }

  return {
    ...toEndpointView(updated),
    secret,
  }
}

export async function revealOrganizationWebhookSecret(input: {
  organizationId: string
}): Promise<OrganizationWebhookEndpointWithSecret> {
  const existing = await requireEndpoint(input.organizationId)
  const secret = decryptWebhookSecret({
    encrypted: existing.secretEncrypted,
    encryptionKey: getWebhookEncryptionKey(),
  })

  return {
    ...toEndpointView(existing),
    secret,
  }
}

export async function disableOrganizationWebhookEndpoint(input: {
  organizationId: string
}): Promise<OrganizationWebhookEndpointView | null> {
  const existing = await db.query.organizationWebhookEndpoint.findFirst({
    where: eq(organizationWebhookEndpoint.organizationId, input.organizationId),
  })

  if (!existing) {
    return null
  }

  const [updated] = await db
    .update(organizationWebhookEndpoint)
    .set({
      enabled: false,
      updatedAt: new Date(),
    })
    .where(eq(organizationWebhookEndpoint.id, existing.id))
    .returning()

  return updated ? toEndpointView(updated) : toEndpointView(existing)
}

export function decryptEndpointSigningSecret(encrypted: string): string {
  return decryptWebhookSecret({
    encrypted,
    encryptionKey: getWebhookEncryptionKey(),
  })
}

async function requireEndpoint(organizationId: string) {
  const existing = await db.query.organizationWebhookEndpoint.findFirst({
    where: eq(organizationWebhookEndpoint.organizationId, organizationId),
  })

  if (!existing) {
    throw new Error("No webhook endpoint is configured for this organization.")
  }

  return existing
}
