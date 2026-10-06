import type { TranscriptStatus } from "./constants"

export type TranscriptSegment = {
  end: number
  start: number
  text: string
}

export type ReportTranscriptView = {
  completedAt: string | null
  durationSeconds: number | null
  error: string | null
  language: string | null
  model: string | null
  segments: TranscriptSegment[]
  startedAt: string | null
  status: TranscriptStatus
  text: string | null
}

export type ReportTranscriptSummary = {
  completedAt: string | null
  error: string | null
  language: string | null
  model: string | null
  segmentCount: number
  status: TranscriptStatus
  text: string | null
}

export type TranscriptionSettingsPublicView = {
  apiKeyLastFour: string | null
  enabled: boolean
  hasApiKey: boolean
  language: string | null
  maskedApiKey: string | null
  model: string
  updatedAt: string | null
}

export type TranscriptionSettingsState = {
  configurable: boolean
  configurationError: string | null
  settings: TranscriptionSettingsPublicView | null
}
