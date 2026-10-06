import { db } from "@crikket/db"
import { organizationTranscriptionSettings } from "@crikket/db/schema/transcription"
import { env } from "@crikket/env/server"
import { eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import {
  decryptOrgSecret,
  encryptOrgSecret,
  getOrgSecretsEncryptionKeyUnavailableReason,
  orgSecretLastFour,
  parseOrgSecretsEncryptionKey,
} from "../org-secrets"
import {
  TRANSCRIPTION_DEFAULT_MODEL,
  TRANSCRIPTION_MAX_API_KEY_LENGTH,
  TRANSCRIPTION_MAX_LANGUAGE_LENGTH,
  TRANSCRIPTION_MODELS,
  type TranscriptionModel,
} from "./constants"
import { testOpenAiTranscriptionKey } from "./openai"
import {
  createTranscriptionSettingsState,
  createUnavailableTranscriptionSettingsState,
  toTranscriptionSettingsPublicView,
} from "./settings-view"
import type { TranscriptionSettingsState } from "./types"

const LANGUAGE_HINT_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z]{2})?$/

export function resolveOrgSecretsEncryptionKeyFromEnv(): {
  encryptionKey: Buffer | null
  reason: string | null
} {
  const raw = env.ORG_SECRETS_ENCRYPTION_KEY
  const reason = getOrgSecretsEncryptionKeyUnavailableReason(raw)
  return {
    encryptionKey: parseOrgSecretsEncryptionKey(raw),
    reason,
  }
}

export async function getTranscriptionSettingsState(input: {
  organizationId: string
}): Promise<TranscriptionSettingsState> {
  const { encryptionKey, reason } = resolveOrgSecretsEncryptionKeyFromEnv()
  if (!encryptionKey || reason) {
    return createUnavailableTranscriptionSettingsState(
      reason ?? "Transcription cannot be configured on this server."
    )
  }

  const row = await db.query.organizationTranscriptionSettings.findFirst({
    where: eq(
      organizationTranscriptionSettings.organizationId,
      input.organizationId
    ),
  })

  return createTranscriptionSettingsState({
    configurationError: null,
    settings: row ? toTranscriptionSettingsPublicView(row) : null,
  })
}

export async function upsertTranscriptionSettings(input: {
  apiKey?: string | null
  createdBy: string
  enabled: boolean
  language?: string | null
  model: TranscriptionModel
  organizationId: string
  removeApiKey?: boolean
}): Promise<TranscriptionSettingsState> {
  const { encryptionKey, reason } = requireEncryptionKey()
  const language = normalizeLanguage(input.language)
  const existing = await db.query.organizationTranscriptionSettings.findFirst({
    where: eq(
      organizationTranscriptionSettings.organizationId,
      input.organizationId
    ),
  })

  let apiKeyEncrypted = existing?.apiKeyEncrypted ?? null
  let apiKeyLastFour = existing?.apiKeyLastFour ?? null

  if (input.removeApiKey) {
    apiKeyEncrypted = null
    apiKeyLastFour = null
  } else if (input.apiKey != null && input.apiKey.trim().length > 0) {
    const apiKey = normalizeApiKey(input.apiKey)
    apiKeyEncrypted = encryptOrgSecret({ encryptionKey, secret: apiKey })
    apiKeyLastFour = orgSecretLastFour(apiKey)
  }

  if (input.enabled && !apiKeyEncrypted) {
    throw new Error("Add an OpenAI API key before enabling transcription.")
  }

  if (existing) {
    const [updated] = await db
      .update(organizationTranscriptionSettings)
      .set({
        apiKeyEncrypted,
        apiKeyLastFour,
        enabled: input.enabled,
        language,
        model: input.model,
        updatedAt: new Date(),
      })
      .where(eq(organizationTranscriptionSettings.id, existing.id))
      .returning()

    if (!updated) {
      throw new Error("Failed to update transcription settings.")
    }

    return createTranscriptionSettingsState({
      configurationError: reason,
      settings: toTranscriptionSettingsPublicView(updated),
    })
  }

  if (!apiKeyEncrypted) {
    throw new Error("Add an OpenAI API key to configure transcription.")
  }

  const [created] = await db
    .insert(organizationTranscriptionSettings)
    .values({
      apiKeyEncrypted,
      apiKeyLastFour,
      createdBy: input.createdBy,
      enabled: input.enabled,
      id: nanoid(16),
      language,
      model: input.model,
      organizationId: input.organizationId,
    })
    .returning()

  if (!created) {
    throw new Error("Failed to create transcription settings.")
  }

  return createTranscriptionSettingsState({
    configurationError: null,
    settings: toTranscriptionSettingsPublicView(created),
  })
}

export async function removeTranscriptionApiKey(input: {
  organizationId: string
}): Promise<TranscriptionSettingsState> {
  requireEncryptionKey()
  const existing = await db.query.organizationTranscriptionSettings.findFirst({
    where: eq(
      organizationTranscriptionSettings.organizationId,
      input.organizationId
    ),
  })

  if (!existing) {
    return createTranscriptionSettingsState({
      configurationError: null,
      settings: null,
    })
  }

  const [updated] = await db
    .update(organizationTranscriptionSettings)
    .set({
      apiKeyEncrypted: null,
      apiKeyLastFour: null,
      enabled: false,
      updatedAt: new Date(),
    })
    .where(eq(organizationTranscriptionSettings.id, existing.id))
    .returning()

  return createTranscriptionSettingsState({
    configurationError: null,
    settings: updated
      ? toTranscriptionSettingsPublicView(updated)
      : toTranscriptionSettingsPublicView(existing),
  })
}

export async function testTranscriptionApiKey(input: {
  apiKey?: string | null
  model?: TranscriptionModel
  organizationId: string
}): Promise<{ message: string; ok: boolean }> {
  const { encryptionKey } = requireEncryptionKey()
  const existing = await db.query.organizationTranscriptionSettings.findFirst({
    where: eq(
      organizationTranscriptionSettings.organizationId,
      input.organizationId
    ),
  })

  const provided = input.apiKey?.trim()
  const apiKey = provided
    ? normalizeApiKey(provided)
    : existing?.apiKeyEncrypted
      ? decryptOrgSecret({
          encrypted: existing.apiKeyEncrypted,
          encryptionKey,
        })
      : null

  if (!apiKey) {
    throw new Error("Enter an OpenAI API key to test, or save one first.")
  }

  const model =
    input.model ??
    (isTranscriptionModel(existing?.model)
      ? existing.model
      : TRANSCRIPTION_DEFAULT_MODEL)

  return testOpenAiTranscriptionKey({ apiKey, model })
}

export async function getEnabledTranscriptionSettingsForOrg(input: {
  organizationId: string
}): Promise<{
  apiKeyEncrypted: string
  language: string | null
  model: TranscriptionModel
  organizationId: string
} | null> {
  const row = await db.query.organizationTranscriptionSettings.findFirst({
    where: eq(
      organizationTranscriptionSettings.organizationId,
      input.organizationId
    ),
  })

  if (!(row?.enabled && row.apiKeyEncrypted)) {
    return null
  }

  return {
    apiKeyEncrypted: row.apiKeyEncrypted,
    language: row.language,
    model: isTranscriptionModel(row.model)
      ? row.model
      : TRANSCRIPTION_DEFAULT_MODEL,
    organizationId: row.organizationId,
  }
}

export function decryptTranscriptionApiKey(encrypted: string): string {
  const { encryptionKey } = requireEncryptionKey()
  return decryptOrgSecret({ encrypted, encryptionKey })
}

function requireEncryptionKey(): { encryptionKey: Buffer; reason: null } {
  const { encryptionKey, reason } = resolveOrgSecretsEncryptionKeyFromEnv()
  if (!encryptionKey || reason) {
    throw new Error(
      reason ?? "Transcription cannot be configured on this server."
    )
  }

  return { encryptionKey, reason: null }
}

function normalizeApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed.length === 0) {
    throw new Error("OpenAI API key is required.")
  }
  if (trimmed.length > TRANSCRIPTION_MAX_API_KEY_LENGTH) {
    throw new Error("OpenAI API key is too long.")
  }
  return trimmed
}

function normalizeLanguage(language: string | null | undefined): string | null {
  if (language == null) {
    return null
  }

  const trimmed = language.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (trimmed.length > TRANSCRIPTION_MAX_LANGUAGE_LENGTH) {
    throw new Error("Language hint is too long.")
  }
  if (!LANGUAGE_HINT_PATTERN.test(trimmed)) {
    throw new Error(
      "Language hint must be an ISO language code such as en or pt-BR."
    )
  }

  return trimmed
}

export function isTranscriptionModel(
  value: string | null | undefined
): value is TranscriptionModel {
  return TRANSCRIPTION_MODELS.includes(value as TranscriptionModel)
}
