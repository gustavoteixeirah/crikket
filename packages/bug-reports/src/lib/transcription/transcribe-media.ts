import {
  getOrgSecretsEncryptionKeyUnavailableReason,
  parseOrgSecretsEncryptionKey,
} from "../org-secrets"
import { prepareAudioForOpenAi } from "./audio"
import {
  TRANSCRIPTION_DEFAULT_MODEL,
  type TranscriptionModel,
} from "./constants"
import {
  isOpenAiRequestError,
  type OpenAiFetch,
  type OpenAiTranscriptionResult,
  transcribeAudioWithOpenAi,
} from "./openai"
import { assertTranscriptionOrgIsolation } from "./policy"
import type { TranscriptSegment } from "./types"

export type TranscriptionAttemptResult =
  | {
      durationSeconds: number | null
      language: string | null
      model: string
      segments: TranscriptSegment[]
      status: "completed"
      text: string
    }
  | {
      error: string
      retryable: boolean
      status: "failed"
    }
  | {
      error: string
      status: "skipped"
    }

export type TranscribeMediaInput = {
  apiKeyEncrypted: string
  attachmentType: string | null
  captureBytes: Buffer
  captureContentType: string | null
  encryptionKeyMaterial: string | null | undefined
  language: string | null
  model: TranscriptionModel
  reportOrganizationId: string
  settingsOrganizationId: string
}

export type TranscribeMediaDependencies = {
  decryptApiKey: (input: { encrypted: string; encryptionKey: Buffer }) => string
  fetchImpl?: OpenAiFetch
  ffmpegAvailable?: () => Promise<boolean>
  transcribe?: typeof transcribeAudioWithOpenAi
}

export async function transcribeReportMedia(
  input: TranscribeMediaInput,
  deps: TranscribeMediaDependencies
): Promise<TranscriptionAttemptResult> {
  const encryptionReason = getOrgSecretsEncryptionKeyUnavailableReason(
    input.encryptionKeyMaterial
  )
  const encryptionKey = parseOrgSecretsEncryptionKey(
    input.encryptionKeyMaterial
  )
  if (!encryptionKey || encryptionReason) {
    return {
      error:
        encryptionReason ?? "ORG_SECRETS_ENCRYPTION_KEY is not configured.",
      status: "skipped",
    }
  }

  assertTranscriptionOrgIsolation({
    reportOrganizationId: input.reportOrganizationId,
    settingsOrganizationId: input.settingsOrganizationId,
  })

  if (input.attachmentType !== "video") {
    return {
      error: "Transcription runs only for video capture artifacts.",
      status: "skipped",
    }
  }

  const prepared = await prepareAudioForOpenAi({
    bytes: input.captureBytes,
    contentType: input.captureContentType,
    ffmpegAvailable: deps.ffmpegAvailable,
  })

  if (prepared.status === "skipped") {
    return {
      error: prepared.error,
      status: "skipped",
    }
  }

  let apiKey: string
  try {
    apiKey = deps.decryptApiKey({
      encrypted: input.apiKeyEncrypted,
      encryptionKey,
    })
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Stored OpenAI API key could not be decrypted.",
      retryable: false,
      status: "failed",
    }
  }

  const transcribe = deps.transcribe ?? transcribeAudioWithOpenAi
  const model = input.model || TRANSCRIPTION_DEFAULT_MODEL

  try {
    const result: OpenAiTranscriptionResult = await transcribe({
      apiKey,
      fetchImpl: deps.fetchImpl,
      file: new Blob([new Uint8Array(prepared.audio.bytes)], {
        type: prepared.audio.contentType,
      }),
      filename: prepared.audio.filename,
      language: input.language,
      model,
    })

    return {
      durationSeconds: result.durationSeconds,
      language: result.language ?? input.language,
      model,
      segments: result.segments,
      status: "completed",
      text: result.text,
    }
  } catch (error) {
    if (isOpenAiRequestError(error)) {
      return {
        error: error.message,
        retryable: error.retryable,
        status: "failed",
      }
    }

    return {
      error:
        error instanceof Error ? error.message : "OpenAI transcription failed.",
      retryable: true,
      status: "failed",
    }
  }
}
