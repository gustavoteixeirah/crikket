import { maskOrgSecret } from "../org-secrets"
import { TRANSCRIPTION_DEFAULT_MODEL } from "./constants"
import type {
  TranscriptionSettingsPublicView,
  TranscriptionSettingsState,
} from "./types"

export function toTranscriptionSettingsPublicView(row: {
  apiKeyLastFour: string | null
  enabled: boolean
  language: string | null
  model: string
  updatedAt: Date | string | null
}): TranscriptionSettingsPublicView {
  const lastFour = row.apiKeyLastFour
  return {
    apiKeyLastFour: lastFour,
    enabled: row.enabled,
    hasApiKey: Boolean(lastFour),
    language: row.language,
    maskedApiKey: lastFour ? maskOrgSecret(lastFour) : null,
    model: row.model || TRANSCRIPTION_DEFAULT_MODEL,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  }
}

export function createUnavailableTranscriptionSettingsState(
  configurationError: string
): TranscriptionSettingsState {
  return {
    configurable: false,
    configurationError,
    settings: null,
  }
}

export function createTranscriptionSettingsState(input: {
  configurationError: string | null
  settings: TranscriptionSettingsPublicView | null
}): TranscriptionSettingsState {
  return {
    configurable: input.configurationError == null,
    configurationError: input.configurationError,
    settings: input.settings,
  }
}

export function settingsViewContainsSecret(
  view: TranscriptionSettingsPublicView,
  secret: string
): boolean {
  const serialized = JSON.stringify(view)
  return secret.length > 0 && serialized.includes(secret)
}
