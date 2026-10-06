export const REPORT_READY_EVENT = "report.ready"
export const WEBHOOK_API_VERSION = "2026-10-06"
export const WEBHOOK_SECRET_PREFIX = "whsec_"

export const WEBHOOK_HEADER_SIGNATURE = "X-Crikket-Signature"
export const WEBHOOK_HEADER_TIMESTAMP = "X-Crikket-Timestamp"
export const WEBHOOK_HEADER_EVENT = "X-Crikket-Event"
export const WEBHOOK_HEADER_DELIVERY = "X-Crikket-Delivery"

export const WEBHOOK_SIGNATURE_PREFIX = "sha256="
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60
export const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000
export const WEBHOOK_MEDIA_URL_TTL_SECONDS = 60 * 60
export const WEBHOOK_DEBUGGER_TOP_ERRORS = 5
export const WEBHOOK_RECENT_DELIVERIES_LIMIT = 20
export const WEBHOOK_MAX_ERROR_LENGTH = 2000
export const WEBHOOK_STALE_PROCESSING_MS = 5 * 60 * 1000
export const WEBHOOK_DEFAULT_BATCH = 10

export const WEBHOOK_SOURCE_TYPE = {
  bugReport: "bug_report",
  test: "test",
} as const

export const WEBHOOK_DELIVERY_STATUS = {
  pending: "pending",
  processing: "processing",
  delivered: "delivered",
  failed: "failed",
  deadLetter: "dead_letter",
  skipped: "skipped",
} as const

export type WebhookDeliveryStatus =
  (typeof WEBHOOK_DELIVERY_STATUS)[keyof typeof WEBHOOK_DELIVERY_STATUS]

export type WebhookSourceType =
  (typeof WEBHOOK_SOURCE_TYPE)[keyof typeof WEBHOOK_SOURCE_TYPE]
