import { db } from "@crikket/db"
import { organizationLinearIntegration } from "@crikket/db/schema/linear"
import { env } from "@crikket/env/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import {
  decryptOrgSecret,
  encryptOrgSecret,
  getOrgSecretsEncryptionKeyUnavailableReason,
  maskOrgSecret,
  orgSecretLastFour,
  parseOrgSecretsEncryptionKey,
} from "../org-secrets"
import { type LinearTeam, listLinearCatalog, testLinearApiKey } from "./client"
import { LINEAR_DEFAULT_GITHUB_REF } from "./constants"
import { testCursorApiKey } from "./cursor-client"
import { isGithubRepoUrl, normalizeGithubRepoUrl } from "./handoff"

export type LinearIntegrationView = {
  createdAt: string
  cursorApiKeyConfigured: boolean
  enabled: boolean
  githubRef: string
  githubRepoUrl: string | null
  hasLinearApiKey: boolean
  id: string
  launchCloudAgent: boolean
  linearLabelIds: string[]
  linearLabelNames: string[]
  linearProjectId: string | null
  linearProjectName: string | null
  linearTeamId: string | null
  linearTeamKey: string | null
  linearTeamName: string | null
  maskedCursorApiKey: string | null
  maskedLinearApiKey: string | null
  updatedAt: string
}

export type LinearIntegrationSecrets = {
  cursorApiKey: string | null
  linearApiKey: string | null
}

export type UpsertLinearIntegrationInput = {
  createdBy: string
  cursorApiKey?: string | null
  enabled: boolean
  githubRef?: string | null
  githubRepoUrl?: string | null
  launchCloudAgent: boolean
  linearApiKey?: string | null
  linearLabelIds?: string[]
  linearLabelNames?: string[]
  linearProjectId?: string | null
  linearProjectName?: string | null
  linearTeamId?: string | null
  linearTeamKey?: string | null
  linearTeamName?: string | null
  organizationId: string
}

function requireOrgSecretsEncryptionKey(): Buffer {
  const raw = env.ORG_SECRETS_ENCRYPTION_KEY
  const reason = getOrgSecretsEncryptionKeyUnavailableReason(raw)
  const encryptionKey = parseOrgSecretsEncryptionKey(raw)
  if (!encryptionKey || reason) {
    throw new Error(
      reason ??
        "ORG_SECRETS_ENCRYPTION_KEY is not set. Generate a 32-byte key with `openssl rand -base64 32` and set it on the server."
    )
  }

  return encryptionKey
}

export function encryptProvidedOrgSecret(secret: string): {
  encrypted: string
  lastFour: string
} {
  const trimmed = secret.trim()
  if (trimmed.length < 8) {
    throw new Error("API key is too short.")
  }

  return {
    encrypted: encryptOrgSecret({
      encryptionKey: requireOrgSecretsEncryptionKey(),
      secret: trimmed,
    }),
    lastFour: orgSecretLastFour(trimmed),
  }
}

export function decryptStoredOrgSecret(encrypted: string): string {
  return decryptOrgSecret({
    encryptionKey: requireOrgSecretsEncryptionKey(),
    encrypted,
  })
}

function toView(row: {
  createdAt: Date
  cursorApiKeyEncrypted: string | null
  cursorApiKeyLastFour: string | null
  enabled: boolean
  githubRef: string
  githubRepoUrl: string | null
  id: string
  launchCloudAgent: boolean
  linearApiKeyEncrypted: string | null
  linearApiKeyLastFour: string | null
  linearLabelIds: string[]
  linearLabelNames: string[]
  linearProjectId: string | null
  linearProjectName: string | null
  linearTeamId: string | null
  linearTeamKey: string | null
  linearTeamName: string | null
  updatedAt: Date
}): LinearIntegrationView {
  return {
    createdAt: row.createdAt.toISOString(),
    cursorApiKeyConfigured: Boolean(row.cursorApiKeyEncrypted),
    enabled: row.enabled,
    githubRef: row.githubRef || LINEAR_DEFAULT_GITHUB_REF,
    githubRepoUrl: row.githubRepoUrl,
    hasLinearApiKey: Boolean(row.linearApiKeyEncrypted),
    id: row.id,
    launchCloudAgent: row.launchCloudAgent,
    linearLabelIds: row.linearLabelIds ?? [],
    linearLabelNames: row.linearLabelNames ?? [],
    linearProjectId: row.linearProjectId,
    linearProjectName: row.linearProjectName,
    linearTeamId: row.linearTeamId,
    linearTeamKey: row.linearTeamKey,
    linearTeamName: row.linearTeamName,
    maskedCursorApiKey: row.cursorApiKeyLastFour
      ? maskOrgSecret(row.cursorApiKeyLastFour)
      : null,
    maskedLinearApiKey: row.linearApiKeyLastFour
      ? maskOrgSecret(row.linearApiKeyLastFour)
      : null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getOrganizationLinearIntegration(input: {
  organizationId: string
}): Promise<LinearIntegrationView | null> {
  const row = await db.query.organizationLinearIntegration.findFirst({
    where: eq(
      organizationLinearIntegration.organizationId,
      input.organizationId
    ),
  })

  return row ? toView(row) : null
}

export async function getOrganizationLinearSecrets(input: {
  organizationId: string
}): Promise<
  (LinearIntegrationSecrets & { view: LinearIntegrationView }) | null
> {
  const row = await db.query.organizationLinearIntegration.findFirst({
    where: eq(
      organizationLinearIntegration.organizationId,
      input.organizationId
    ),
  })

  if (!row) {
    return null
  }

  return {
    cursorApiKey: row.cursorApiKeyEncrypted
      ? decryptStoredOrgSecret(row.cursorApiKeyEncrypted)
      : null,
    linearApiKey: row.linearApiKeyEncrypted
      ? decryptStoredOrgSecret(row.linearApiKeyEncrypted)
      : null,
    view: toView(row),
  }
}

type ExistingLinearRow = {
  cursorApiKeyEncrypted: string | null
  githubRepoUrl: string | null
  id: string
  linearApiKeyEncrypted: string | null
  linearLabelIds: string[]
  linearLabelNames: string[]
  linearProjectId: string | null
  linearProjectName: string | null
  linearTeamId: string | null
  linearTeamKey: string | null
  linearTeamName: string | null
}

function parseOptionalGithubRepo(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  const normalized = normalizeGithubRepoUrl(trimmed)
  if (!isGithubRepoUrl(normalized)) {
    throw new Error(
      "GitHub repository must be an https://github.com/owner/repo URL."
    )
  }

  return normalized
}

function assertLinearUpsertReady(input: {
  cursorKey: string | null
  enabled: boolean
  existing: ExistingLinearRow | undefined
  githubRepoUrl: string | null
  launchCloudAgent: boolean
  linearKey: string | null
  linearTeamId?: string | null
}): void {
  if (
    input.launchCloudAgent &&
    !(input.githubRepoUrl || input.existing?.githubRepoUrl)
  ) {
    throw new Error(
      "Set a GitHub repository before launching Cursor cloud agents automatically."
    )
  }

  if (
    input.enabled &&
    !(input.linearKey || input.existing?.linearApiKeyEncrypted)
  ) {
    throw new Error("Save a Linear API key before enabling the integration.")
  }

  if (input.enabled && !(input.linearTeamId || input.existing?.linearTeamId)) {
    throw new Error("Select a Linear team before enabling the integration.")
  }

  if (
    input.launchCloudAgent &&
    !(input.cursorKey || input.existing?.cursorApiKeyEncrypted)
  ) {
    throw new Error(
      "Save a Cursor API key before launching cloud agents automatically."
    )
  }
}

function pickOptional<T>(incoming: T | undefined, fallback: T): T {
  return incoming === undefined ? fallback : incoming
}

export async function upsertOrganizationLinearIntegration(
  input: UpsertLinearIntegrationInput
): Promise<LinearIntegrationView> {
  const githubRepoUrl = parseOptionalGithubRepo(input.githubRepoUrl)
  const githubRef = input.githubRef?.trim() || LINEAR_DEFAULT_GITHUB_REF
  const linearKey = input.linearApiKey?.trim() || null
  const cursorKey = input.cursorApiKey?.trim() || null
  const linearEncrypted = linearKey ? encryptProvidedOrgSecret(linearKey) : null
  const cursorEncrypted = cursorKey ? encryptProvidedOrgSecret(cursorKey) : null

  const existing = await db.query.organizationLinearIntegration.findFirst({
    where: eq(
      organizationLinearIntegration.organizationId,
      input.organizationId
    ),
  })

  assertLinearUpsertReady({
    cursorKey,
    enabled: input.enabled,
    existing,
    githubRepoUrl,
    launchCloudAgent: input.launchCloudAgent,
    linearKey,
    linearTeamId: input.linearTeamId,
  })

  const values = {
    enabled: input.enabled,
    githubRef,
    githubRepoUrl: githubRepoUrl ?? existing?.githubRepoUrl ?? null,
    launchCloudAgent: input.launchCloudAgent,
    linearLabelIds: input.linearLabelIds ?? existing?.linearLabelIds ?? [],
    linearLabelNames:
      input.linearLabelNames ?? existing?.linearLabelNames ?? [],
    linearProjectId: pickOptional(
      input.linearProjectId,
      existing?.linearProjectId ?? null
    ),
    linearProjectName: pickOptional(
      input.linearProjectName,
      existing?.linearProjectName ?? null
    ),
    linearTeamId: pickOptional(
      input.linearTeamId,
      existing?.linearTeamId ?? null
    ),
    linearTeamKey: pickOptional(
      input.linearTeamKey,
      existing?.linearTeamKey ?? null
    ),
    linearTeamName: pickOptional(
      input.linearTeamName,
      existing?.linearTeamName ?? null
    ),
    updatedAt: new Date(),
    ...(linearEncrypted
      ? {
          linearApiKeyEncrypted: linearEncrypted.encrypted,
          linearApiKeyLastFour: linearEncrypted.lastFour,
        }
      : {}),
    ...(cursorEncrypted
      ? {
          cursorApiKeyEncrypted: cursorEncrypted.encrypted,
          cursorApiKeyLastFour: cursorEncrypted.lastFour,
        }
      : {}),
  }

  if (existing) {
    const [updated] = await db
      .update(organizationLinearIntegration)
      .set(values)
      .where(eq(organizationLinearIntegration.id, existing.id))
      .returning()

    if (!updated) {
      throw new Error("Failed to update Linear integration.")
    }

    return toView(updated)
  }

  const [inserted] = await db
    .insert(organizationLinearIntegration)
    .values({
      createdBy: input.createdBy,
      id: nanoid(16),
      organizationId: input.organizationId,
      ...values,
    })
    .returning()

  if (!inserted) {
    throw new Error("Failed to save Linear integration.")
  }

  return toView(inserted)
}

export async function testStoredLinearApiKey(input: {
  fetchImpl?: typeof fetch
  organizationId: string
}): Promise<{ ok: true; viewerName: string | null }> {
  const secrets = await getOrganizationLinearSecrets(input)
  if (!secrets?.linearApiKey) {
    throw new Error("Save a Linear API key before testing it.")
  }

  return testLinearApiKey({
    apiKey: secrets.linearApiKey,
    fetchImpl: input.fetchImpl,
  })
}

export async function testStoredCursorApiKey(input: {
  fetchImpl?: typeof fetch
  organizationId: string
}): Promise<{ ok: true }> {
  const secrets = await getOrganizationLinearSecrets(input)
  if (!secrets?.cursorApiKey) {
    throw new Error("Save a Cursor API key before testing it.")
  }

  return testCursorApiKey({
    apiKey: secrets.cursorApiKey,
    fetchImpl: input.fetchImpl,
  })
}

export async function listStoredLinearCatalog(input: {
  fetchImpl?: typeof fetch
  organizationId: string
}): Promise<LinearTeam[]> {
  const secrets = await getOrganizationLinearSecrets(input)
  if (!secrets?.linearApiKey) {
    throw new Error("Save a Linear API key before loading teams and projects.")
  }

  return listLinearCatalog({
    apiKey: secrets.linearApiKey,
    fetchImpl: input.fetchImpl,
  })
}
