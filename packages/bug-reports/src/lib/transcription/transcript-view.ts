import { TRANSCRIPT_STATUS, type TranscriptStatus } from "./constants"
import type {
  ReportTranscriptSummary,
  ReportTranscriptView,
  TranscriptSegment,
} from "./types"

export function toTranscriptView(row: {
  completedAt: Date | null
  durationSeconds: number | null
  error: string | null
  language: string | null
  model: string | null
  segments: TranscriptSegment[] | null
  startedAt: Date | null
  status: string
  text: string | null
}): ReportTranscriptView {
  return {
    completedAt: row.completedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    error: row.error,
    language: row.language,
    model: row.model,
    segments: Array.isArray(row.segments) ? row.segments : [],
    startedAt: row.startedAt?.toISOString() ?? null,
    status: isTranscriptStatus(row.status)
      ? row.status
      : TRANSCRIPT_STATUS.pending,
    text: row.text,
  }
}

export function toTranscriptSummary(
  transcript: ReportTranscriptView | null
): ReportTranscriptSummary | null {
  if (!transcript) {
    return null
  }

  return {
    completedAt: transcript.completedAt,
    error: transcript.error,
    language: transcript.language,
    model: transcript.model,
    segmentCount: transcript.segments.length,
    status: transcript.status,
    text: transcript.text,
  }
}

function isTranscriptStatus(value: string): value is TranscriptStatus {
  return Object.values(TRANSCRIPT_STATUS).includes(value as TranscriptStatus)
}
