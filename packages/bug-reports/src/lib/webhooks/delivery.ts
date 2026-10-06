import { db } from "@crikket/db"
import { organization } from "@crikket/db/schema/auth"
import { bugReport } from "@crikket/db/schema/bug-report"
import {
  organizationWebhookEndpoint,
  webhookDelivery,
} from "@crikket/db/schema/webhook"
import { BUG_REPORT_SUBMISSION_STATUS_OPTIONS } from "@crikket/shared/constants/bug-report"
import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { isWebhookPrivateUrlAllowed } from "./app-url"
import {
  REPORT_READY_EVENT,
  TRANSCRIPT_READY_EVENT,
  WEBHOOK_DEFAULT_BATCH,
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_HEADER_DELIVERY,
  WEBHOOK_HEADER_EVENT,
  WEBHOOK_HEADER_SIGNATURE,
  WEBHOOK_HEADER_TIMESTAMP,
  WEBHOOK_MAX_ERROR_LENGTH,
  WEBHOOK_RECENT_DELIVERIES_LIMIT,
  WEBHOOK_REQUEST_TIMEOUT_MS,
  WEBHOOK_SOURCE_TYPE,
  WEBHOOK_STALE_PROCESSING_MS,
  type WebhookDeliveryStatus,
} from "./constants"
import { decryptEndpointSigningSecret } from "./endpoint"
import { stringifyWebhookPayload } from "./payload"
import {
  buildReportReadyPayloadForReport,
  buildSyntheticReportReadyPayload,
  buildTranscriptReadyPayloadForReport,
} from "./payload-builder"
import {
  assertWebhookOrgIsolation,
  isRetryableWebhookHttpStatus,
  resolveWebhookFailureStatus,
  scheduleWebhookRetryAt,
} from "./policy"
import { signWebhookPayload } from "./signature"
import { assertWebhookDestinationAllowed } from "./ssrf"

export interface WebhookDeliveryView {
  attempts: number
  createdAt: string
  deliveredAt: string | null
  eventType: string
  httpStatus: number | null
  id: string
  lastError: string | null
  sourceId: string
  sourceType: string
  status: string
  updatedAt: string
}

type ProcessWebhookDeliveryResult = {
  status: WebhookDeliveryStatus
}

export async function enqueueReportReadyWebhook(input: {
  bugReportId: string
  organizationId: string
}): Promise<{ deliveryId: string | null; enqueued: boolean }> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      id: true,
      organizationId: true,
      submissionStatus: true,
    },
  })

  if (
    !report ||
    report.submissionStatus !== BUG_REPORT_SUBMISSION_STATUS_OPTIONS.ready
  ) {
    return { deliveryId: null, enqueued: false }
  }

  const endpoint = await db.query.organizationWebhookEndpoint.findFirst({
    where: and(
      eq(organizationWebhookEndpoint.organizationId, report.organizationId),
      eq(organizationWebhookEndpoint.enabled, true)
    ),
  })

  if (!endpoint) {
    return { deliveryId: null, enqueued: false }
  }

  assertWebhookOrgIsolation({
    endpointOrganizationId: endpoint.organizationId,
    reportOrganizationId: report.organizationId,
  })

  const deliveryId = nanoid(16)
  const inserted = await insertDeliveryIfNew({
    destinationUrl: endpoint.url,
    endpointId: endpoint.id,
    eventType: REPORT_READY_EVENT,
    id: deliveryId,
    organizationId: endpoint.organizationId,
    payload: {},
    sourceId: report.id,
    sourceType: WEBHOOK_SOURCE_TYPE.bugReport,
  })

  if (!inserted) {
    return { deliveryId: null, enqueued: false }
  }

  queueBackgroundDelivery(deliveryId)

  return { deliveryId, enqueued: true }
}

export async function enqueueReportReadyWebhookSafe(input: {
  bugReportId: string
  organizationId: string
}): Promise<void> {
  try {
    await enqueueReportReadyWebhook(input)
  } catch (error) {
    reportNonFatalError(
      `Failed to enqueue report.ready webhook for ${input.bugReportId}`,
      error
    )
  }
}

export async function enqueueTranscriptReadyWebhook(input: {
  bugReportId: string
  organizationId: string
}): Promise<{ deliveryId: string | null; enqueued: boolean }> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      id: true,
      organizationId: true,
    },
  })

  if (!report) {
    return { deliveryId: null, enqueued: false }
  }

  const endpoint = await db.query.organizationWebhookEndpoint.findFirst({
    where: and(
      eq(organizationWebhookEndpoint.organizationId, report.organizationId),
      eq(organizationWebhookEndpoint.enabled, true)
    ),
  })

  if (!endpoint) {
    return { deliveryId: null, enqueued: false }
  }

  assertWebhookOrgIsolation({
    endpointOrganizationId: endpoint.organizationId,
    reportOrganizationId: report.organizationId,
  })

  const deliveryId = nanoid(16)
  const inserted = await insertDeliveryIfNew({
    destinationUrl: endpoint.url,
    endpointId: endpoint.id,
    eventType: TRANSCRIPT_READY_EVENT,
    id: deliveryId,
    organizationId: endpoint.organizationId,
    payload: {},
    sourceId: report.id,
    sourceType: WEBHOOK_SOURCE_TYPE.bugReport,
  })

  if (!inserted) {
    return { deliveryId: null, enqueued: false }
  }

  queueBackgroundDelivery(deliveryId)

  return { deliveryId, enqueued: true }
}

export async function enqueueTranscriptReadyWebhookSafe(input: {
  bugReportId: string
  organizationId: string
}): Promise<void> {
  try {
    await enqueueTranscriptReadyWebhook(input)
  } catch (error) {
    reportNonFatalError(
      `Failed to enqueue transcript.ready webhook for ${input.bugReportId}`,
      error
    )
  }
}

export async function enqueueWebhookTestEvent(input: {
  organizationId: string
}): Promise<WebhookDeliveryView> {
  const endpoint = await db.query.organizationWebhookEndpoint.findFirst({
    where: eq(organizationWebhookEndpoint.organizationId, input.organizationId),
  })

  if (!endpoint) {
    throw new Error("Save a webhook URL before sending a test event.")
  }

  if (!endpoint.enabled) {
    throw new Error("Enable the webhook before sending a test event.")
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, input.organizationId),
    columns: {
      id: true,
      name: true,
      slug: true,
    },
  })

  if (!org) {
    throw new Error("Organization not found.")
  }

  const deliveryId = nanoid(16)
  const payload = buildSyntheticReportReadyPayload({
    deliveryId,
    organization: org,
  })

  const inserted = await insertDeliveryIfNew({
    destinationUrl: endpoint.url,
    endpointId: endpoint.id,
    eventType: REPORT_READY_EVENT,
    id: deliveryId,
    organizationId: endpoint.organizationId,
    payload,
    sourceId: `test_${deliveryId}`,
    sourceType: WEBHOOK_SOURCE_TYPE.test,
  })

  if (!inserted) {
    throw new Error("Failed to enqueue the test webhook event.")
  }

  await processWebhookDelivery({ deliveryId })

  const row = await db.query.webhookDelivery.findFirst({
    where: and(
      eq(webhookDelivery.id, deliveryId),
      eq(webhookDelivery.organizationId, input.organizationId)
    ),
  })

  if (!row) {
    throw new Error("Test webhook delivery was not recorded.")
  }

  return toDeliveryView(row)
}

export async function listWebhookDeliveries(input: {
  limit?: number
  organizationId: string
}): Promise<WebhookDeliveryView[]> {
  const rows = await db.query.webhookDelivery.findMany({
    where: eq(webhookDelivery.organizationId, input.organizationId),
    orderBy: [desc(webhookDelivery.createdAt)],
    limit: input.limit ?? WEBHOOK_RECENT_DELIVERIES_LIMIT,
  })

  return rows.map(toDeliveryView)
}

export async function processWebhookDelivery(input: {
  deliveryId: string
}): Promise<ProcessWebhookDeliveryResult> {
  const claimed = await claimWebhookDelivery(input.deliveryId)
  if (!claimed) {
    return { status: WEBHOOK_DELIVERY_STATUS.skipped }
  }

  const endpoint = await db.query.organizationWebhookEndpoint.findFirst({
    where: eq(organizationWebhookEndpoint.id, claimed.endpointId),
  })

  if (!endpoint?.enabled) {
    await markWebhookDeliveryFailure({
      attempts: claimed.attempts,
      deliveryId: claimed.id,
      error: "Webhook endpoint is missing or disabled.",
      httpStatus: null,
      retryable: false,
    })
    return { status: WEBHOOK_DELIVERY_STATUS.deadLetter }
  }

  assertWebhookOrgIsolation({
    endpointOrganizationId: endpoint.organizationId,
    reportOrganizationId: claimed.organizationId,
  })

  try {
    await assertWebhookDestinationAllowed(endpoint.url, {
      allowPrivate: isWebhookPrivateUrlAllowed(),
    })

    const payload = await resolveDeliveryPayload({
      delivery: claimed,
      organizationId: endpoint.organizationId,
    })
    const body = stringifyWebhookPayload(payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const secret = decryptEndpointSigningSecret(endpoint.secretEncrypted)
    const signature = signWebhookPayload({
      body,
      secret,
      timestamp,
    })

    await db
      .update(webhookDelivery)
      .set({
        destinationUrl: endpoint.url,
        payload,
        updatedAt: new Date(),
      })
      .where(eq(webhookDelivery.id, claimed.id))

    const response = await fetch(endpoint.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_REQUEST_TIMEOUT_MS),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "Crikket-Webhook/1.0",
        [WEBHOOK_HEADER_DELIVERY]: claimed.id,
        [WEBHOOK_HEADER_EVENT]: claimed.eventType,
        [WEBHOOK_HEADER_SIGNATURE]: signature,
        [WEBHOOK_HEADER_TIMESTAMP]: timestamp,
      },
      body,
    })

    if (response.status >= 200 && response.status < 300) {
      await db
        .update(webhookDelivery)
        .set({
          deliveredAt: new Date(),
          httpStatus: response.status,
          lastError: null,
          status: WEBHOOK_DELIVERY_STATUS.delivered,
          updatedAt: new Date(),
        })
        .where(eq(webhookDelivery.id, claimed.id))

      return { status: WEBHOOK_DELIVERY_STATUS.delivered }
    }

    const retryable = isRetryableWebhookHttpStatus(response.status)
    const error = `Webhook endpoint returned HTTP ${response.status}.`
    const status = await markWebhookDeliveryFailure({
      attempts: claimed.attempts,
      deliveryId: claimed.id,
      error,
      httpStatus: response.status,
      retryable,
    })

    return { status }
  } catch (error) {
    const message = serializeWebhookError(error)
    const status = await markWebhookDeliveryFailure({
      attempts: claimed.attempts,
      deliveryId: claimed.id,
      error: message,
      httpStatus: null,
      retryable: true,
    })

    return { status }
  }
}

export async function runWebhookDeliveryPass(options?: {
  limit?: number
}): Promise<{
  delivered: number
  deadLettered: number
  processed: number
  retried: number
  skipped: number
}> {
  const now = new Date()
  const staleProcessingThreshold = new Date(
    Date.now() - WEBHOOK_STALE_PROCESSING_MS
  )
  const dueJobs = await db.query.webhookDelivery.findMany({
    where: or(
      and(
        inArray(webhookDelivery.status, [
          WEBHOOK_DELIVERY_STATUS.pending,
          WEBHOOK_DELIVERY_STATUS.failed,
        ]),
        lte(webhookDelivery.nextAttemptAt, now)
      ),
      and(
        eq(webhookDelivery.status, WEBHOOK_DELIVERY_STATUS.processing),
        lte(webhookDelivery.updatedAt, staleProcessingThreshold)
      )
    ),
    orderBy: [asc(webhookDelivery.nextAttemptAt)],
    limit: options?.limit ?? WEBHOOK_DEFAULT_BATCH,
  })

  let delivered = 0
  let deadLettered = 0
  let retried = 0
  let skipped = 0

  for (const job of dueJobs) {
    const result = await processWebhookDelivery({ deliveryId: job.id })

    if (result.status === WEBHOOK_DELIVERY_STATUS.delivered) {
      delivered += 1
      continue
    }

    if (result.status === WEBHOOK_DELIVERY_STATUS.deadLetter) {
      deadLettered += 1
      continue
    }

    if (result.status === WEBHOOK_DELIVERY_STATUS.failed) {
      retried += 1
      continue
    }

    skipped += 1
  }

  return {
    delivered,
    deadLettered,
    processed: dueJobs.length,
    retried,
    skipped,
  }
}

function queueBackgroundDelivery(deliveryId: string): void {
  setTimeout(() => {
    processWebhookDelivery({ deliveryId }).catch((error: unknown) => {
      reportNonFatalError(
        `Failed to process webhook delivery ${deliveryId}`,
        error
      )
    })
  }, 0)
}

async function insertDeliveryIfNew(input: {
  destinationUrl: string
  endpointId: string
  eventType: string
  id: string
  organizationId: string
  payload: unknown
  sourceId: string
  sourceType: string
}): Promise<boolean> {
  try {
    await db.insert(webhookDelivery).values({
      destinationUrl: input.destinationUrl,
      endpointId: input.endpointId,
      eventType: input.eventType,
      id: input.id,
      organizationId: input.organizationId,
      payload: input.payload as unknown as Record<string, unknown>,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      status: WEBHOOK_DELIVERY_STATUS.pending,
    })
    return true
  } catch (error) {
    if (isUniqueViolation(error)) {
      return false
    }

    throw error
  }
}

async function claimWebhookDelivery(deliveryId: string): Promise<{
  attempts: number
  endpointId: string
  eventType: string
  id: string
  organizationId: string
  sourceId: string
  sourceType: string
} | null> {
  const staleProcessingThreshold = new Date(
    Date.now() - WEBHOOK_STALE_PROCESSING_MS
  )
  const [claimed] = await db
    .update(webhookDelivery)
    .set({
      attempts: sql`${webhookDelivery.attempts} + 1`,
      lastError: null,
      status: WEBHOOK_DELIVERY_STATUS.processing,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(webhookDelivery.id, deliveryId),
        or(
          inArray(webhookDelivery.status, [
            WEBHOOK_DELIVERY_STATUS.pending,
            WEBHOOK_DELIVERY_STATUS.failed,
          ]),
          and(
            eq(webhookDelivery.status, WEBHOOK_DELIVERY_STATUS.processing),
            lte(webhookDelivery.updatedAt, staleProcessingThreshold)
          )
        )
      )
    )
    .returning({
      attempts: webhookDelivery.attempts,
      endpointId: webhookDelivery.endpointId,
      eventType: webhookDelivery.eventType,
      id: webhookDelivery.id,
      organizationId: webhookDelivery.organizationId,
      sourceId: webhookDelivery.sourceId,
      sourceType: webhookDelivery.sourceType,
    })

  return claimed ?? null
}

async function resolveDeliveryPayload(input: {
  delivery: {
    eventType: string
    id: string
    sourceId: string
    sourceType: string
  }
  organizationId: string
}): Promise<Record<string, unknown>> {
  if (input.delivery.sourceType === WEBHOOK_SOURCE_TYPE.test) {
    const existing = await db.query.webhookDelivery.findFirst({
      where: eq(webhookDelivery.id, input.delivery.id),
      columns: {
        payload: true,
      },
    })

    if (existing?.payload && Object.keys(existing.payload).length > 0) {
      return existing.payload
    }
  }

  if (input.delivery.eventType === TRANSCRIPT_READY_EVENT) {
    const transcriptPayload = await buildTranscriptReadyPayloadForReport({
      bugReportId: input.delivery.sourceId,
      deliveryId: input.delivery.id,
      organizationId: input.organizationId,
      test: input.delivery.sourceType === WEBHOOK_SOURCE_TYPE.test,
    })

    if (!transcriptPayload) {
      throw new Error("Transcript was not found for this webhook delivery.")
    }

    return transcriptPayload as unknown as Record<string, unknown>
  }

  const payload = await buildReportReadyPayloadForReport({
    bugReportId: input.delivery.sourceId,
    deliveryId: input.delivery.id,
    organizationId: input.organizationId,
    test: input.delivery.sourceType === WEBHOOK_SOURCE_TYPE.test,
  })

  if (!payload) {
    throw new Error("Bug report was not found for this webhook delivery.")
  }

  return payload as unknown as Record<string, unknown>
}

async function markWebhookDeliveryFailure(input: {
  attempts: number
  deliveryId: string
  error: string
  httpStatus: number | null
  retryable: boolean
}): Promise<Extract<WebhookDeliveryStatus, "dead_letter" | "failed">> {
  const status = input.retryable
    ? resolveWebhookFailureStatus(input.attempts)
    : WEBHOOK_DELIVERY_STATUS.deadLetter
  const nextAttemptAt = scheduleWebhookRetryAt({ attempts: input.attempts })

  await db
    .update(webhookDelivery)
    .set({
      httpStatus: input.httpStatus,
      lastError: input.error.slice(0, WEBHOOK_MAX_ERROR_LENGTH),
      nextAttemptAt,
      status,
      updatedAt: new Date(),
    })
    .where(eq(webhookDelivery.id, input.deliveryId))

  return status
}

function toDeliveryView(row: {
  attempts: number
  createdAt: Date
  deliveredAt: Date | null
  eventType: string
  httpStatus: number | null
  id: string
  lastError: string | null
  sourceId: string
  sourceType: string
  status: string
  updatedAt: Date
}): WebhookDeliveryView {
  return {
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    eventType: row.eventType,
    httpStatus: row.httpStatus,
    id: row.id,
    lastError: row.lastError,
    sourceId: row.sourceId,
    sourceType: row.sourceType,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function serializeWebhookError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, WEBHOOK_MAX_ERROR_LENGTH)
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  )
}
