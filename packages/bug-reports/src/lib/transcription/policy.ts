import {
  TRANSCRIPTION_JOB_STATUS,
  type TranscriptionJobStatus,
} from "./constants"

export const TRANSCRIPTION_MAX_ATTEMPTS = 5
const TRANSCRIPTION_BASE_DELAY_MS = 60_000
const TRANSCRIPTION_MAX_DELAY_MS = 24 * 60 * 60 * 1000

export function calculateTranscriptionRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1)
  const delay = TRANSCRIPTION_BASE_DELAY_MS * 2 ** exponent
  return Math.min(delay, TRANSCRIPTION_MAX_DELAY_MS)
}

export function resolveTranscriptionFailureStatus(
  attempts: number
): Extract<TranscriptionJobStatus, "dead_letter" | "failed"> {
  return attempts >= TRANSCRIPTION_MAX_ATTEMPTS
    ? TRANSCRIPTION_JOB_STATUS.deadLetter
    : TRANSCRIPTION_JOB_STATUS.failed
}

export function scheduleTranscriptionRetryAt(input: {
  attempts: number
  now?: Date
}): Date {
  return new Date(
    (input.now ?? new Date()).getTime() +
      calculateTranscriptionRetryDelayMs(input.attempts)
  )
}

export function isRetryableOpenAiHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) {
    return true
  }

  return status >= 500 && status <= 599
}

export function assertTranscriptionOrgIsolation(input: {
  reportOrganizationId: string
  settingsOrganizationId: string
}): void {
  if (input.reportOrganizationId !== input.settingsOrganizationId) {
    throw new Error(
      "Transcription settings organization does not match the bug report organization."
    )
  }
}
