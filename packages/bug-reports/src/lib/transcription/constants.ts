export const TRANSCRIPTION_DEFAULT_MODEL = "gpt-4o-mini-transcribe"
export const TRANSCRIPTION_MODELS = [
  "gpt-4o-mini-transcribe",
  "whisper-1",
] as const

export type TranscriptionModel = (typeof TRANSCRIPTION_MODELS)[number]

export const TRANSCRIPT_STATUS = {
  pending: "pending",
  processing: "processing",
  completed: "completed",
  failed: "failed",
  skipped: "skipped",
} as const

export type TranscriptStatus =
  (typeof TRANSCRIPT_STATUS)[keyof typeof TRANSCRIPT_STATUS]

export const TRANSCRIPTION_JOB_STATUS = {
  pending: "pending",
  processing: "processing",
  completed: "completed",
  failed: "failed",
  deadLetter: "dead_letter",
  skipped: "skipped",
} as const

export type TranscriptionJobStatus =
  (typeof TRANSCRIPTION_JOB_STATUS)[keyof typeof TRANSCRIPTION_JOB_STATUS]

export const OPENAI_TRANSCRIPTIONS_URL =
  "https://api.openai.com/v1/audio/transcriptions"
export const OPENAI_MODELS_URL = "https://api.openai.com/v1/models"
export const OPENAI_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024
export const OPENAI_REQUEST_TIMEOUT_MS = 120_000
export const OPENAI_TEST_TIMEOUT_MS = 15_000

export const TRANSCRIPTION_MAX_ERROR_LENGTH = 2000
export const TRANSCRIPTION_STALE_PROCESSING_MS = 5 * 60 * 1000
export const TRANSCRIPTION_DEFAULT_BATCH = 10
export const TRANSCRIPTION_MAX_LANGUAGE_LENGTH = 16
export const TRANSCRIPTION_MAX_API_KEY_LENGTH = 256
