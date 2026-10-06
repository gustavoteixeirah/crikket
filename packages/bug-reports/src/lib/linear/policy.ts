import {
  LINEAR_HANDOFF_STATUS,
  LINEAR_MAX_ATTEMPTS,
  type LinearHandoffStatus,
} from "./constants"

const LINEAR_BASE_DELAY_MS = 2 * 60 * 1000
const LINEAR_MAX_DELAY_MS = 4 * 60 * 60 * 1000

export function calculateLinearRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1)
  const delay = LINEAR_BASE_DELAY_MS * 2 ** exponent
  return Math.min(delay, LINEAR_MAX_DELAY_MS)
}

export function resolveLinearFailureStatus(
  attempts: number
): Extract<LinearHandoffStatus, "dead_letter" | "failed"> {
  return attempts >= LINEAR_MAX_ATTEMPTS
    ? LINEAR_HANDOFF_STATUS.deadLetter
    : LINEAR_HANDOFF_STATUS.failed
}

export function scheduleLinearRetryAt(input: {
  attempts: number
  now?: Date
}): Date {
  return new Date(
    (input.now ?? new Date()).getTime() +
      calculateLinearRetryDelayMs(input.attempts)
  )
}

export function isRetryableLinearHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) {
    return true
  }

  return status >= 500 && status <= 599
}

export function assertLinearOrgIsolation(input: {
  integrationOrganizationId: string
  reportOrganizationId: string
}): void {
  if (input.integrationOrganizationId !== input.reportOrganizationId) {
    throw new Error(
      "Linear integration organization does not match the bug report organization."
    )
  }
}
