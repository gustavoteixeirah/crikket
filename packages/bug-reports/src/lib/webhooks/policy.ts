import {
  WEBHOOK_DELIVERY_STATUS,
  type WebhookDeliveryStatus,
} from "./constants"

export const WEBHOOK_MAX_ATTEMPTS = 8
const WEBHOOK_BASE_DELAY_MS = 2 * 60 * 1000
const WEBHOOK_MAX_DELAY_MS = 4 * 60 * 60 * 1000

export function calculateWebhookRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1)
  const delay = WEBHOOK_BASE_DELAY_MS * 2 ** exponent
  return Math.min(delay, WEBHOOK_MAX_DELAY_MS)
}

export function resolveWebhookFailureStatus(
  attempts: number
): Extract<WebhookDeliveryStatus, "dead_letter" | "failed"> {
  return attempts >= WEBHOOK_MAX_ATTEMPTS
    ? WEBHOOK_DELIVERY_STATUS.deadLetter
    : WEBHOOK_DELIVERY_STATUS.failed
}

export function scheduleWebhookRetryAt(input: {
  attempts: number
  now?: Date
}): Date {
  return new Date(
    (input.now ?? new Date()).getTime() +
      calculateWebhookRetryDelayMs(input.attempts)
  )
}

export function isRetryableWebhookHttpStatus(status: number): boolean {
  if (status === 408 || status === 429) {
    return true
  }

  return status >= 500 && status <= 599
}

export function assertWebhookOrgIsolation(input: {
  endpointOrganizationId: string
  reportOrganizationId: string
}): void {
  if (input.endpointOrganizationId !== input.reportOrganizationId) {
    throw new Error(
      "Webhook endpoint organization does not match the bug report organization."
    )
  }
}
