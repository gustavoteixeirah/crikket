import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const ORGANIZATION_API_KEY_PREFIX = "crik_ak_"
export const ORGANIZATION_API_KEY_SCOPE_READ = "read"
export const ORGANIZATION_API_KEY_SCOPES = [
  ORGANIZATION_API_KEY_SCOPE_READ,
] as const

export type OrganizationApiKeyScope =
  (typeof ORGANIZATION_API_KEY_SCOPES)[number]

const SECRET_BYTES = 32
const KEY_PREFIX_VISIBLE_CHARS = 12
const MAX_API_KEY_TOKEN_LENGTH = 200
const LAST_USED_TOUCH_INTERVAL_MS = 60 * 1000
const BEARER_TOKEN_PATTERN = /^Bearer\s+(\S+)/i

export type OrganizationApiKeyRecord = {
  createdAt: Date
  createdBy: string | null
  id: string
  keyHash: string
  keyPrefix: string
  label: string
  lastUsedAt: Date | null
  organizationId: string
  revokedAt: Date | null
  scope: string
  updatedAt: Date
}

export type OrganizationApiKeyPublicRecord = Omit<
  OrganizationApiKeyRecord,
  "keyHash"
>

export type CreatedOrganizationApiKey = OrganizationApiKeyPublicRecord & {
  key: string
}

export type AuthenticatedOrganizationApiKey = {
  keyId: string
  organizationId: string
  scope: OrganizationApiKeyScope
}

export type OrganizationApiKeyStore = {
  findByHash: (keyHash: string) => Promise<OrganizationApiKeyRecord | null>
  insert: (input: {
    createdBy: string | null
    id: string
    keyHash: string
    keyPrefix: string
    label: string
    organizationId: string
    scope: OrganizationApiKeyScope
  }) => Promise<OrganizationApiKeyRecord>
  listByOrganizationId: (
    organizationId: string
  ) => Promise<OrganizationApiKeyRecord[]>
  revoke: (input: { keyId: string; organizationId: string }) => Promise<boolean>
  touchLastUsedAt: (input: { keyId: string; lastUsedAt: Date }) => Promise<void>
}

export function hashOrganizationApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex")
}

export function getOrganizationApiKeyPrefix(secret: string): string {
  return secret.slice(0, KEY_PREFIX_VISIBLE_CHARS)
}

export function generateOrganizationApiKeySecret(): {
  hash: string
  prefix: string
  secret: string
} {
  const secret = `${ORGANIZATION_API_KEY_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`

  return {
    hash: hashOrganizationApiKey(secret),
    prefix: getOrganizationApiKeyPrefix(secret),
    secret,
  }
}

export function parseBearerToken(
  authorizationHeader: string | null | undefined
): string | null {
  if (!authorizationHeader) {
    return null
  }

  const match = BEARER_TOKEN_PATTERN.exec(authorizationHeader.trim())
  const token = match?.[1]?.trim()
  if (!token) {
    return null
  }

  return token
}

export function isOrganizationApiKeySecretFormat(token: string): boolean {
  return (
    token.startsWith(ORGANIZATION_API_KEY_PREFIX) &&
    token.length > ORGANIZATION_API_KEY_PREFIX.length &&
    token.length <= MAX_API_KEY_TOKEN_LENGTH
  )
}

export function hashesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function isOrganizationApiKeyActive(
  record: Pick<OrganizationApiKeyRecord, "revokedAt" | "scope">
): record is Pick<OrganizationApiKeyRecord, "revokedAt" | "scope"> & {
  scope: OrganizationApiKeyScope
} {
  return (
    record.revokedAt === null &&
    record.scope === ORGANIZATION_API_KEY_SCOPE_READ
  )
}

export function toOrganizationApiKeyPublicRecord(
  record: OrganizationApiKeyRecord
): OrganizationApiKeyPublicRecord {
  return {
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    id: record.id,
    keyPrefix: record.keyPrefix,
    label: record.label,
    lastUsedAt: record.lastUsedAt,
    organizationId: record.organizationId,
    revokedAt: record.revokedAt,
    scope: record.scope,
    updatedAt: record.updatedAt,
  }
}

export async function createOrganizationApiKey(
  input: {
    createdBy?: string | null
    label: string
    organizationId: string
  },
  store: OrganizationApiKeyStore
): Promise<CreatedOrganizationApiKey> {
  const label = input.label.trim().slice(0, 80)
  if (!label) {
    throw new Error("API key label is required.")
  }

  const generated = generateOrganizationApiKeySecret()
  const record = await store.insert({
    createdBy: input.createdBy ?? null,
    id: randomBytes(12).toString("hex"),
    keyHash: generated.hash,
    keyPrefix: generated.prefix,
    label,
    organizationId: input.organizationId,
    scope: ORGANIZATION_API_KEY_SCOPE_READ,
  })

  return {
    ...toOrganizationApiKeyPublicRecord(record),
    key: generated.secret,
  }
}

export async function listOrganizationApiKeys(
  input: { organizationId: string },
  store: OrganizationApiKeyStore
): Promise<OrganizationApiKeyPublicRecord[]> {
  const records = await store.listByOrganizationId(input.organizationId)
  return records.map(toOrganizationApiKeyPublicRecord)
}

export function revokeOrganizationApiKey(
  input: { keyId: string; organizationId: string },
  store: OrganizationApiKeyStore
): Promise<boolean> {
  return store.revoke(input)
}

export async function authenticateOrganizationApiKey(
  token: string,
  store: OrganizationApiKeyStore,
  now = () => new Date()
): Promise<AuthenticatedOrganizationApiKey | null> {
  if (!isOrganizationApiKeySecretFormat(token)) {
    return null
  }

  const keyHash = hashOrganizationApiKey(token)
  const record = await store.findByHash(keyHash)
  if (!(record && hashesEqual(record.keyHash, keyHash))) {
    return null
  }

  if (!isOrganizationApiKeyActive(record)) {
    return null
  }

  const usedAt = now()
  const shouldTouchLastUsed =
    record.lastUsedAt === null ||
    usedAt.getTime() - record.lastUsedAt.getTime() >=
      LAST_USED_TOUCH_INTERVAL_MS

  if (shouldTouchLastUsed) {
    try {
      await store.touchLastUsedAt({
        keyId: record.id,
        lastUsedAt: usedAt,
      })
    } catch {
      // lastUsedAt is diagnostic only; a failed touch must not block auth.
    }
  }

  return {
    keyId: record.id,
    organizationId: record.organizationId,
    scope: record.scope,
  }
}
