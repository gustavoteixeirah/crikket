import { db } from "@crikket/db"
import { bugReport } from "@crikket/db/schema/bug-report"
import {
  bugReportTranscript,
  bugReportTranscriptionJob,
} from "@crikket/db/schema/transcription"
import { env } from "@crikket/env/server"
import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { ORPCError } from "@orpc/server"
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { decryptOrgSecret } from "../org-secrets"
import { getStorageProvider } from "../storage"
import { enqueueTranscriptReadyWebhookSafe } from "../webhooks/delivery"
import {
  TRANSCRIPT_STATUS,
  TRANSCRIPTION_DEFAULT_BATCH,
  TRANSCRIPTION_MAX_ERROR_LENGTH,
  TRANSCRIPTION_STALE_PROCESSING_MS,
  type TranscriptionJobStatus,
  type TranscriptStatus,
} from "./constants"
import {
  resolveTranscriptionFailureStatus,
  scheduleTranscriptionRetryAt,
} from "./policy"
import { getEnabledTranscriptionSettingsForOrg } from "./settings"
import {
  type TranscriptionAttemptResult,
  transcribeReportMedia,
} from "./transcribe-media"
import { toTranscriptView } from "./transcript-view"
import type { ReportTranscriptView, TranscriptSegment } from "./types"

interface QueueTranscriptionJobInput {
  bugReportId: string
  force?: boolean
  organizationId: string
}

export async function enqueueTranscriptionForReadyReportSafe(input: {
  bugReportId: string
  organizationId: string
}): Promise<void> {
  try {
    await enqueueTranscriptionForReadyReport(input)
  } catch (error) {
    reportNonFatalError(
      `Failed to enqueue transcription for ${input.bugReportId}`,
      error
    )
  }
}

export async function enqueueTranscriptionForReadyReport(input: {
  bugReportId: string
  organizationId: string
}): Promise<{ enqueued: boolean; jobId: string | null }> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      attachmentType: true,
      captureKey: true,
      id: true,
      organizationId: true,
    },
  })

  if (!report || report.attachmentType !== "video" || !report.captureKey) {
    return { enqueued: false, jobId: null }
  }

  const settings = await getEnabledTranscriptionSettingsForOrg({
    organizationId: report.organizationId,
  })
  if (!settings) {
    return { enqueued: false, jobId: null }
  }

  const existing = await db.query.bugReportTranscript.findFirst({
    where: and(
      eq(bugReportTranscript.bugReportId, report.id),
      eq(bugReportTranscript.organizationId, report.organizationId)
    ),
    columns: {
      id: true,
    },
  })

  if (existing) {
    return { enqueued: false, jobId: null }
  }

  const { jobId } = await queueTranscriptionJob({
    bugReportId: report.id,
    organizationId: report.organizationId,
  })
  queueBackgroundTranscription(jobId)

  return { enqueued: true, jobId }
}

export async function retryBugReportTranscription(input: {
  bugReportId: string
  organizationId: string
}): Promise<{ jobId: string; status: TranscriptionJobStatus }> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      attachmentType: true,
      captureKey: true,
      id: true,
      organizationId: true,
    },
  })

  if (!report) {
    throw new ORPCError("NOT_FOUND", { message: "Bug report not found" })
  }

  if (report.attachmentType !== "video" || !report.captureKey) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Transcription is only available for video reports.",
    })
  }

  const settings = await getEnabledTranscriptionSettingsForOrg({
    organizationId: report.organizationId,
  })
  if (!settings) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Enable transcription and save an OpenAI API key in organization settings.",
    })
  }

  const { jobId } = await queueTranscriptionJob({
    bugReportId: report.id,
    force: true,
    organizationId: report.organizationId,
  })

  return processTranscriptionJob({ jobId })
}

export async function queueTranscriptionJob(
  input: QueueTranscriptionJobInput
): Promise<{ jobId: string }> {
  const jobId = nanoid(16)

  await db.insert(bugReportTranscriptionJob).values({
    bugReportId: input.bugReportId,
    id: jobId,
    organizationId: input.organizationId,
    status: "pending",
  })

  await upsertTranscriptRow({
    bugReportId: input.bugReportId,
    organizationId: input.organizationId,
    reset: input.force === true,
    status: TRANSCRIPT_STATUS.pending,
  })

  return { jobId }
}

export async function processTranscriptionJob(input: {
  jobId: string
}): Promise<{ jobId: string; status: TranscriptionJobStatus }> {
  const claimed = await claimTranscriptionJob(input.jobId)
  if (!claimed) {
    return { jobId: input.jobId, status: "skipped" }
  }

  const report = await db.query.bugReport.findFirst({
    where: eq(bugReport.id, claimed.bugReportId),
  })

  if (!report || report.organizationId !== claimed.organizationId) {
    await markTranscriptionJobCompleted(claimed.jobId)
    return { jobId: claimed.jobId, status: "completed" }
  }

  await upsertTranscriptRow({
    bugReportId: report.id,
    organizationId: report.organizationId,
    status: TRANSCRIPT_STATUS.processing,
  })

  const settings = await getEnabledTranscriptionSettingsForOrg({
    organizationId: report.organizationId,
  })

  if (!settings) {
    return finishAttempt({
      attempts: claimed.attempts,
      bugReportId: report.id,
      jobId: claimed.jobId,
      organizationId: report.organizationId,
      result: {
        error: "Transcription is disabled or the OpenAI API key was removed.",
        status: "skipped",
      },
    })
  }

  if (report.attachmentType !== "video" || !report.captureKey) {
    return finishAttempt({
      attempts: claimed.attempts,
      bugReportId: report.id,
      jobId: claimed.jobId,
      organizationId: report.organizationId,
      result: {
        error: "Transcription runs only for video capture artifacts.",
        status: "skipped",
      },
    })
  }

  try {
    const captureBytes = await getStorageProvider().read(report.captureKey)
    const result = await transcribeReportMedia(
      {
        apiKeyEncrypted: settings.apiKeyEncrypted,
        attachmentType: report.attachmentType,
        captureBytes,
        captureContentType: report.captureContentType,
        encryptionKeyMaterial: env.ORG_SECRETS_ENCRYPTION_KEY,
        language: settings.language,
        model: settings.model,
        reportOrganizationId: report.organizationId,
        settingsOrganizationId: settings.organizationId,
      },
      {
        decryptApiKey: ({ encrypted, encryptionKey }) =>
          decryptOrgSecret({ encrypted, encryptionKey }),
      }
    )

    return finishAttempt({
      attempts: claimed.attempts,
      bugReportId: report.id,
      jobId: claimed.jobId,
      organizationId: report.organizationId,
      result,
    })
  } catch (error) {
    const message = serializeTranscriptionError(error)
    reportNonFatalError(`Failed to transcribe bug report ${report.id}`, error)

    return finishAttempt({
      attempts: claimed.attempts,
      bugReportId: report.id,
      jobId: claimed.jobId,
      organizationId: report.organizationId,
      result: {
        error: message,
        retryable: true,
        status: "failed",
      },
    })
  }
}

export async function runTranscriptionPass(options?: {
  limit?: number
}): Promise<{
  completed: number
  deadLettered: number
  processed: number
  retried: number
  skipped: number
}> {
  const now = new Date()
  const staleProcessingThreshold = new Date(
    Date.now() - TRANSCRIPTION_STALE_PROCESSING_MS
  )
  const dueJobs = await db.query.bugReportTranscriptionJob.findMany({
    where: or(
      and(
        inArray(bugReportTranscriptionJob.status, ["pending", "failed"]),
        lte(bugReportTranscriptionJob.nextAttemptAt, now)
      ),
      and(
        eq(bugReportTranscriptionJob.status, "processing"),
        lte(bugReportTranscriptionJob.updatedAt, staleProcessingThreshold)
      )
    ),
    orderBy: [asc(bugReportTranscriptionJob.nextAttemptAt)],
    limit: options?.limit ?? TRANSCRIPTION_DEFAULT_BATCH,
  })

  let completed = 0
  let deadLettered = 0
  let retried = 0
  let skipped = 0

  for (const job of dueJobs) {
    const result = await processTranscriptionJob({ jobId: job.id })

    if (result.status === "completed") {
      completed += 1
      continue
    }

    if (result.status === "dead_letter") {
      deadLettered += 1
      continue
    }

    if (result.status === "failed") {
      retried += 1
      continue
    }

    skipped += 1
  }

  return {
    completed,
    deadLettered,
    processed: dueJobs.length,
    retried,
    skipped,
  }
}

export async function getTranscriptForReport(input: {
  bugReportId: string
  organizationId: string
}): Promise<ReportTranscriptView | null> {
  const row = await db.query.bugReportTranscript.findFirst({
    where: and(
      eq(bugReportTranscript.bugReportId, input.bugReportId),
      eq(bugReportTranscript.organizationId, input.organizationId)
    ),
  })

  if (!row) {
    return null
  }

  return toTranscriptView(row)
}

export { toTranscriptSummary, toTranscriptView } from "./transcript-view"

function queueBackgroundTranscription(jobId: string): void {
  setTimeout(() => {
    processTranscriptionJob({ jobId }).catch((error: unknown) => {
      reportNonFatalError(`Failed to process transcription job ${jobId}`, error)
    })
  }, 0)
}

async function claimTranscriptionJob(jobId: string): Promise<{
  attempts: number
  bugReportId: string
  jobId: string
  organizationId: string
} | null> {
  const staleProcessingThreshold = new Date(
    Date.now() - TRANSCRIPTION_STALE_PROCESSING_MS
  )
  const [claimed] = await db
    .update(bugReportTranscriptionJob)
    .set({
      attempts: sql`${bugReportTranscriptionJob.attempts} + 1`,
      lastError: null,
      status: "processing",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bugReportTranscriptionJob.id, jobId),
        or(
          inArray(bugReportTranscriptionJob.status, ["pending", "failed"]),
          and(
            eq(bugReportTranscriptionJob.status, "processing"),
            lte(bugReportTranscriptionJob.updatedAt, staleProcessingThreshold)
          )
        )
      )
    )
    .returning({
      attempts: bugReportTranscriptionJob.attempts,
      bugReportId: bugReportTranscriptionJob.bugReportId,
      id: bugReportTranscriptionJob.id,
      organizationId: bugReportTranscriptionJob.organizationId,
    })

  if (!claimed) {
    return null
  }

  return {
    attempts: claimed.attempts,
    bugReportId: claimed.bugReportId,
    jobId: claimed.id,
    organizationId: claimed.organizationId,
  }
}

async function finishAttempt(input: {
  attempts: number
  bugReportId: string
  jobId: string
  organizationId: string
  result: TranscriptionAttemptResult
}): Promise<{ jobId: string; status: TranscriptionJobStatus }> {
  if (input.result.status === "completed") {
    await upsertTranscriptRow({
      bugReportId: input.bugReportId,
      completedAt: new Date(),
      durationSeconds: input.result.durationSeconds,
      error: null,
      language: input.result.language,
      model: input.result.model,
      organizationId: input.organizationId,
      segments: input.result.segments,
      status: TRANSCRIPT_STATUS.completed,
      text: input.result.text,
    })
    await markTranscriptionJobCompleted(input.jobId)
    await enqueueTranscriptReadyWebhookSafe({
      bugReportId: input.bugReportId,
      organizationId: input.organizationId,
    })
    return { jobId: input.jobId, status: "completed" }
  }

  if (input.result.status === "skipped") {
    await upsertTranscriptRow({
      bugReportId: input.bugReportId,
      completedAt: new Date(),
      error: input.result.error,
      organizationId: input.organizationId,
      status: TRANSCRIPT_STATUS.skipped,
    })
    await markTranscriptionJobCompleted(input.jobId)
    return { jobId: input.jobId, status: "completed" }
  }

  if (!input.result.retryable) {
    await upsertTranscriptRow({
      bugReportId: input.bugReportId,
      completedAt: new Date(),
      error: input.result.error,
      organizationId: input.organizationId,
      status: TRANSCRIPT_STATUS.failed,
    })
    await markTranscriptionJobFailure({
      attempts: input.attempts,
      error: input.result.error,
      jobId: input.jobId,
      retryable: false,
    })
    return { jobId: input.jobId, status: "dead_letter" }
  }

  const jobStatus = resolveTranscriptionFailureStatus(input.attempts)
  await upsertTranscriptRow({
    bugReportId: input.bugReportId,
    error: input.result.error,
    organizationId: input.organizationId,
    status: TRANSCRIPT_STATUS.failed,
  })
  await markTranscriptionJobFailure({
    attempts: input.attempts,
    error: input.result.error,
    jobId: input.jobId,
    retryable: true,
  })

  return { jobId: input.jobId, status: jobStatus }
}

async function upsertTranscriptRow(input: {
  bugReportId: string
  completedAt?: Date | null
  durationSeconds?: number | null
  error?: string | null
  language?: string | null
  model?: string | null
  organizationId: string
  reset?: boolean
  segments?: TranscriptSegment[] | null
  status: TranscriptStatus
  text?: string | null
}): Promise<void> {
  const existing = await db.query.bugReportTranscript.findFirst({
    where: and(
      eq(bugReportTranscript.bugReportId, input.bugReportId),
      eq(bugReportTranscript.organizationId, input.organizationId)
    ),
  })
  const startedAt =
    input.status === TRANSCRIPT_STATUS.processing ? new Date() : null
  const nextValues = buildTranscriptRowValues({
    completedAt: input.completedAt,
    durationSeconds: input.durationSeconds,
    error: input.error,
    language: input.language,
    model: input.model,
    reset: input.reset === true,
    segments: input.segments,
    startedAt,
    status: input.status,
    text: input.text,
  })

  if (existing) {
    await db
      .update(bugReportTranscript)
      .set(nextValues)
      .where(eq(bugReportTranscript.id, existing.id))
    return
  }

  await db.insert(bugReportTranscript).values({
    ...nextValues,
    bugReportId: input.bugReportId,
    id: nanoid(16),
    organizationId: input.organizationId,
  })
}

function buildTranscriptRowValues(input: {
  completedAt?: Date | null
  durationSeconds?: number | null
  error?: string | null
  language?: string | null
  model?: string | null
  reset: boolean
  segments?: TranscriptSegment[] | null
  startedAt: Date | null
  status: TranscriptStatus
  text?: string | null
}) {
  if (input.reset) {
    return {
      completedAt: null,
      durationSeconds: null,
      error: input.error ?? null,
      language: null,
      model: null,
      segments: [] as TranscriptSegment[],
      startedAt: input.startedAt,
      status: input.status,
      text: null,
      updatedAt: new Date(),
    }
  }

  return compactUndefined({
    completedAt: input.completedAt,
    durationSeconds: input.durationSeconds,
    error: input.error,
    language: input.language,
    model: input.model,
    segments: input.segments,
    startedAt: input.startedAt ?? undefined,
    status: input.status,
    text: input.text,
    updatedAt: new Date(),
  })
}

async function markTranscriptionJobCompleted(jobId: string): Promise<void> {
  await db
    .update(bugReportTranscriptionJob)
    .set({
      lastError: null,
      status: "completed",
      updatedAt: new Date(),
    })
    .where(eq(bugReportTranscriptionJob.id, jobId))
}

async function markTranscriptionJobFailure(input: {
  attempts: number
  error: string
  jobId: string
  retryable: boolean
}): Promise<void> {
  const status = input.retryable
    ? resolveTranscriptionFailureStatus(input.attempts)
    : "dead_letter"
  const nextAttemptAt = scheduleTranscriptionRetryAt({
    attempts: input.attempts,
  })

  await db
    .update(bugReportTranscriptionJob)
    .set({
      lastError: input.error.slice(0, TRANSCRIPTION_MAX_ERROR_LENGTH),
      nextAttemptAt,
      status,
      updatedAt: new Date(),
    })
    .where(eq(bugReportTranscriptionJob.id, input.jobId))
}

function serializeTranscriptionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, TRANSCRIPTION_MAX_ERROR_LENGTH)
}

function compactUndefined<T extends Record<string, unknown>>(
  value: T
): Partial<T> {
  const result: Partial<T> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key as keyof T] = entry as T[keyof T]
    }
  }
  return result
}
