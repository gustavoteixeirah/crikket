import { db } from "@crikket/db"
import { bugReport } from "@crikket/db/schema/bug-report"
import { linearHandoffJob } from "@crikket/db/schema/linear"
import { BUG_REPORT_SUBMISSION_STATUS_OPTIONS } from "@crikket/shared/constants/bug-report"
import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getReportContextForOrganization } from "../agent-report-context"
import { drizzleAgentReportStore } from "../agent-report-store"
import { resolveWebhookAppBaseUrl } from "../webhooks/app-url"
import { LinearApiError } from "./client"
import {
  LINEAR_DEFAULT_BATCH,
  LINEAR_HANDOFF_KIND,
  LINEAR_HANDOFF_STATUS,
  LINEAR_MAX_ERROR_LENGTH,
  LINEAR_STALE_PROCESSING_MS,
  type LinearHandoffKind,
  type LinearHandoffStatus,
} from "./constants"
import { CursorApiError } from "./cursor-client"
import { assertReportBelongsToOrg } from "./decisions"
import { buildHandoffLinks } from "./handoff"
import { withIngestIsolation } from "./isolate"
import { executeCreateLinearIssue, executeLaunchCursorAgent } from "./pipeline"
import { resolveLinearFailureStatus, scheduleLinearRetryAt } from "./policy"
import { getOrganizationLinearSecrets } from "./settings"

export type LinearHandoffEnqueueResult = {
  enqueued: boolean
  jobId: string | null
}

type FetchImpl = typeof fetch

function serializeHandoffError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, LINEAR_MAX_ERROR_LENGTH)
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  )
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof LinearApiError || error instanceof CursorApiError) {
    return error.retryable
  }

  return true
}

export async function enqueueLinearHandoff(input: {
  bugReportId: string
  kind?: LinearHandoffKind
  organizationId: string
  requireEnabled?: boolean
}): Promise<LinearHandoffEnqueueResult> {
  const kind = input.kind ?? LINEAR_HANDOFF_KIND.createIssue
  const requireEnabled = input.requireEnabled ?? true

  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      cursorAgentId: true,
      id: true,
      linearIssueId: true,
      organizationId: true,
      submissionStatus: true,
    },
  })

  if (!report) {
    return { enqueued: false, jobId: null }
  }

  if (
    kind === LINEAR_HANDOFF_KIND.createIssue &&
    report.submissionStatus !== BUG_REPORT_SUBMISSION_STATUS_OPTIONS.ready
  ) {
    return { enqueued: false, jobId: null }
  }

  if (kind === LINEAR_HANDOFF_KIND.createIssue && report.linearIssueId) {
    return { enqueued: false, jobId: null }
  }

  if (kind === LINEAR_HANDOFF_KIND.launchAgent && report.cursorAgentId) {
    return { enqueued: false, jobId: null }
  }

  const secrets = await getOrganizationLinearSecrets({
    organizationId: report.organizationId,
  })

  if (requireEnabled) {
    if (!secrets?.view.enabled) {
      return { enqueued: false, jobId: null }
    }

    if (
      kind === LINEAR_HANDOFF_KIND.launchAgent &&
      !secrets.view.launchCloudAgent
    ) {
      return { enqueued: false, jobId: null }
    }
  }

  const jobId = nanoid(16)
  try {
    await db.insert(linearHandoffJob).values({
      bugReportId: report.id,
      id: jobId,
      kind,
      organizationId: report.organizationId,
      status: LINEAR_HANDOFF_STATUS.pending,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { enqueued: false, jobId: null }
    }

    throw error
  }

  queueBackgroundHandoff(jobId)
  return { enqueued: true, jobId }
}

export async function enqueueLinearHandoffSafe(input: {
  bugReportId: string
  organizationId: string
}): Promise<void> {
  await withIngestIsolation(
    `Failed to enqueue Linear handoff for ${input.bugReportId}`,
    () =>
      enqueueLinearHandoff({
        bugReportId: input.bugReportId,
        kind: LINEAR_HANDOFF_KIND.createIssue,
        organizationId: input.organizationId,
        requireEnabled: true,
      })
  )
}

export async function createLinearIssueForReportNow(input: {
  bugReportId: string
  fetchImpl?: FetchImpl
  organizationId: string
}): Promise<{
  identifier: string | null
  skipped: boolean
  url: string | null
}> {
  const existing = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      linearIssueIdentifier: true,
      linearIssueUrl: true,
    },
  })

  if (existing?.linearIssueUrl) {
    return {
      identifier: existing.linearIssueIdentifier,
      skipped: true,
      url: existing.linearIssueUrl,
    }
  }

  const enqueued = await enqueueLinearHandoff({
    bugReportId: input.bugReportId,
    kind: LINEAR_HANDOFF_KIND.createIssue,
    organizationId: input.organizationId,
    requireEnabled: false,
  })

  const jobId =
    enqueued.jobId ??
    (await findJobId({
      bugReportId: input.bugReportId,
      kind: LINEAR_HANDOFF_KIND.createIssue,
      organizationId: input.organizationId,
    }))

  if (!jobId) {
    throw new Error("Could not enqueue a Linear issue job for this report.")
  }

  await resetJobIfTerminal(jobId)
  await processLinearHandoffJob({ fetchImpl: input.fetchImpl, jobId })

  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      linearIssueIdentifier: true,
      linearIssueUrl: true,
    },
  })

  if (!report?.linearIssueUrl) {
    const job = await db.query.linearHandoffJob.findFirst({
      where: eq(linearHandoffJob.id, jobId),
      columns: { lastError: true, status: true },
    })
    throw new Error(
      job?.lastError ||
        "Linear issue was not created. Check the Linear API key and team."
    )
  }

  return {
    identifier: report.linearIssueIdentifier,
    skipped: false,
    url: report.linearIssueUrl,
  }
}

export async function launchCursorAgentForReportNow(input: {
  bugReportId: string
  fetchImpl?: FetchImpl
  organizationId: string
}): Promise<{
  skipped: boolean
  url: string | null
}> {
  const existing = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      cursorAgentUrl: true,
    },
  })

  if (existing?.cursorAgentUrl) {
    return { skipped: true, url: existing.cursorAgentUrl }
  }

  const enqueued = await enqueueLinearHandoff({
    bugReportId: input.bugReportId,
    kind: LINEAR_HANDOFF_KIND.launchAgent,
    organizationId: input.organizationId,
    requireEnabled: false,
  })

  const jobId =
    enqueued.jobId ??
    (await findJobId({
      bugReportId: input.bugReportId,
      kind: LINEAR_HANDOFF_KIND.launchAgent,
      organizationId: input.organizationId,
    }))

  if (!jobId) {
    throw new Error(
      "Could not enqueue a Cursor cloud agent job for this report."
    )
  }

  await resetJobIfTerminal(jobId)
  await processLinearHandoffJob({ fetchImpl: input.fetchImpl, jobId })

  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: { cursorAgentUrl: true },
  })

  if (!report?.cursorAgentUrl) {
    const job = await db.query.linearHandoffJob.findFirst({
      where: eq(linearHandoffJob.id, jobId),
      columns: { lastError: true },
    })
    throw new Error(
      job?.lastError ||
        "Cursor cloud agent was not launched. Check the Cursor API key and GitHub repo."
    )
  }

  return { skipped: false, url: report.cursorAgentUrl }
}

export async function processLinearHandoffJob(input: {
  fetchImpl?: FetchImpl
  jobId: string
}): Promise<{ status: LinearHandoffStatus }> {
  const claimed = await claimLinearHandoffJob(input.jobId)
  if (!claimed) {
    return { status: LINEAR_HANDOFF_STATUS.skipped }
  }

  try {
    if (claimed.kind === LINEAR_HANDOFF_KIND.createIssue) {
      await processCreateIssueJob({ claimed, fetchImpl: input.fetchImpl })
    } else if (claimed.kind === LINEAR_HANDOFF_KIND.launchAgent) {
      await processLaunchAgentJob({ claimed, fetchImpl: input.fetchImpl })
    } else {
      throw new Error(`Unknown Linear handoff job kind: ${claimed.kind}`)
    }

    await db
      .update(linearHandoffJob)
      .set({
        lastError: null,
        status: LINEAR_HANDOFF_STATUS.completed,
        updatedAt: new Date(),
      })
      .where(eq(linearHandoffJob.id, claimed.id))

    return { status: LINEAR_HANDOFF_STATUS.completed }
  } catch (error) {
    const retryable = isRetryableError(error)
    const status = retryable
      ? resolveLinearFailureStatus(claimed.attempts)
      : LINEAR_HANDOFF_STATUS.deadLetter

    await db
      .update(linearHandoffJob)
      .set({
        lastError: serializeHandoffError(error),
        nextAttemptAt: scheduleLinearRetryAt({ attempts: claimed.attempts }),
        status,
        updatedAt: new Date(),
      })
      .where(eq(linearHandoffJob.id, claimed.id))

    return { status }
  }
}

export async function runLinearHandoffPass(options?: {
  fetchImpl?: FetchImpl
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
    Date.now() - LINEAR_STALE_PROCESSING_MS
  )
  const dueJobs = await db.query.linearHandoffJob.findMany({
    where: or(
      and(
        inArray(linearHandoffJob.status, [
          LINEAR_HANDOFF_STATUS.pending,
          LINEAR_HANDOFF_STATUS.failed,
        ]),
        lte(linearHandoffJob.nextAttemptAt, now)
      ),
      and(
        eq(linearHandoffJob.status, LINEAR_HANDOFF_STATUS.processing),
        lte(linearHandoffJob.updatedAt, staleProcessingThreshold)
      )
    ),
    orderBy: [asc(linearHandoffJob.nextAttemptAt)],
    limit: options?.limit ?? LINEAR_DEFAULT_BATCH,
  })

  let completed = 0
  let deadLettered = 0
  let retried = 0
  let skipped = 0

  for (const job of dueJobs) {
    const result = await processLinearHandoffJob({
      fetchImpl: options?.fetchImpl,
      jobId: job.id,
    })

    if (result.status === LINEAR_HANDOFF_STATUS.completed) {
      completed += 1
      continue
    }

    if (result.status === LINEAR_HANDOFF_STATUS.deadLetter) {
      deadLettered += 1
      continue
    }

    if (result.status === LINEAR_HANDOFF_STATUS.failed) {
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

function queueBackgroundHandoff(jobId: string): void {
  setTimeout(() => {
    processLinearHandoffJob({ jobId }).catch((error: unknown) => {
      reportNonFatalError(`Failed to process Linear handoff ${jobId}`, error)
    })
  }, 0)
}

async function findJobId(input: {
  bugReportId: string
  kind: LinearHandoffKind
  organizationId: string
}): Promise<string | null> {
  const row = await db.query.linearHandoffJob.findFirst({
    where: and(
      eq(linearHandoffJob.bugReportId, input.bugReportId),
      eq(linearHandoffJob.kind, input.kind),
      eq(linearHandoffJob.organizationId, input.organizationId)
    ),
    columns: { id: true },
  })

  return row?.id ?? null
}

async function resetJobIfTerminal(jobId: string): Promise<void> {
  await db
    .update(linearHandoffJob)
    .set({
      lastError: null,
      nextAttemptAt: new Date(),
      status: LINEAR_HANDOFF_STATUS.pending,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(linearHandoffJob.id, jobId),
        inArray(linearHandoffJob.status, [
          LINEAR_HANDOFF_STATUS.failed,
          LINEAR_HANDOFF_STATUS.deadLetter,
          LINEAR_HANDOFF_STATUS.skipped,
        ])
      )
    )
}

async function claimLinearHandoffJob(jobId: string): Promise<{
  attempts: number
  bugReportId: string
  id: string
  kind: string
  organizationId: string
} | null> {
  const staleProcessingThreshold = new Date(
    Date.now() - LINEAR_STALE_PROCESSING_MS
  )
  const [claimed] = await db
    .update(linearHandoffJob)
    .set({
      attempts: sql`${linearHandoffJob.attempts} + 1`,
      lastError: null,
      status: LINEAR_HANDOFF_STATUS.processing,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(linearHandoffJob.id, jobId),
        or(
          inArray(linearHandoffJob.status, [
            LINEAR_HANDOFF_STATUS.pending,
            LINEAR_HANDOFF_STATUS.failed,
          ]),
          and(
            eq(linearHandoffJob.status, LINEAR_HANDOFF_STATUS.processing),
            lte(linearHandoffJob.updatedAt, staleProcessingThreshold)
          )
        )
      )
    )
    .returning({
      attempts: linearHandoffJob.attempts,
      bugReportId: linearHandoffJob.bugReportId,
      id: linearHandoffJob.id,
      kind: linearHandoffJob.kind,
      organizationId: linearHandoffJob.organizationId,
    })

  return claimed ?? null
}

async function processCreateIssueJob(input: {
  claimed: {
    bugReportId: string
    id: string
    organizationId: string
  }
  fetchImpl?: FetchImpl
}): Promise<void> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.claimed.bugReportId),
      eq(bugReport.organizationId, input.claimed.organizationId)
    ),
    columns: {
      id: true,
      linearIssueId: true,
      linearIssueIdentifier: true,
      linearIssueUrl: true,
      organizationId: true,
      title: true,
    },
  })

  if (!report) {
    throw new LinearApiError({
      message: "Bug report was not found for this Linear handoff.",
      retryable: false,
    })
  }

  assertReportBelongsToOrg({
    organizationId: input.claimed.organizationId,
    reportOrganizationId: report.organizationId,
  })

  const secrets = await getOrganizationLinearSecrets({
    organizationId: report.organizationId,
  })
  if (!secrets) {
    throw new LinearApiError({
      message: "Linear integration is missing an API key or team.",
      retryable: false,
    })
  }

  const context = await getReportContextForOrganization(
    {
      organizationId: report.organizationId,
      reportId: report.id,
    },
    drizzleAgentReportStore
  )
  const result = await executeCreateLinearIssue({
    existingIssue:
      report.linearIssueId &&
      report.linearIssueUrl &&
      report.linearIssueIdentifier
        ? {
            id: report.linearIssueId,
            identifier: report.linearIssueIdentifier,
            url: report.linearIssueUrl,
          }
        : null,
    fetchImpl: input.fetchImpl,
    integration: {
      cursorApiKey: secrets.cursorApiKey,
      githubRef: secrets.view.githubRef,
      githubRepoUrl: secrets.view.githubRepoUrl,
      launchCloudAgent: secrets.view.launchCloudAgent,
      linearApiKey: secrets.linearApiKey,
      linearLabelIds: secrets.view.linearLabelIds,
      linearProjectId: secrets.view.linearProjectId,
      linearTeamId: secrets.view.linearTeamId,
    },
    links: buildHandoffLinks({
      appBaseUrl: resolveWebhookAppBaseUrl(),
      reportId: report.id,
    }),
    markdown: context.markdown,
    reportId: report.id,
    reportTitle: report.title || context.title,
  })

  if (result.created) {
    await db
      .update(bugReport)
      .set({
        linearIssueId: result.issue.id,
        linearIssueIdentifier: result.issue.identifier,
        linearIssueUrl: result.issue.url,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bugReport.id, report.id),
          eq(bugReport.organizationId, report.organizationId)
        )
      )
  }

  await db
    .update(linearHandoffJob)
    .set({
      result: {
        identifier: result.issue.identifier,
        issueId: result.issue.id,
        truncated: result.built.truncated,
        url: result.issue.url,
      },
      updatedAt: new Date(),
    })
    .where(eq(linearHandoffJob.id, input.claimed.id))

  if (result.shouldLaunchAgent) {
    await enqueueLinearHandoff({
      bugReportId: report.id,
      kind: LINEAR_HANDOFF_KIND.launchAgent,
      organizationId: report.organizationId,
      requireEnabled: false,
    })
  }
}

async function processLaunchAgentJob(input: {
  claimed: {
    bugReportId: string
    id: string
    organizationId: string
  }
  fetchImpl?: FetchImpl
}): Promise<void> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.claimed.bugReportId),
      eq(bugReport.organizationId, input.claimed.organizationId)
    ),
    columns: {
      cursorAgentId: true,
      cursorAgentUrl: true,
      id: true,
      linearIssueId: true,
      linearIssueUrl: true,
      organizationId: true,
      title: true,
    },
  })

  if (!report) {
    throw new CursorApiError({
      message: "Bug report was not found for this Cursor agent handoff.",
      retryable: false,
    })
  }

  assertReportBelongsToOrg({
    organizationId: input.claimed.organizationId,
    reportOrganizationId: report.organizationId,
  })

  const secrets = await getOrganizationLinearSecrets({
    organizationId: report.organizationId,
  })
  if (!secrets) {
    throw new CursorApiError({
      message: "Cursor integration is missing an API key or GitHub repository.",
      retryable: false,
    })
  }

  const context = await getReportContextForOrganization(
    {
      organizationId: report.organizationId,
      reportId: report.id,
    },
    drizzleAgentReportStore
  )
  const result = await executeLaunchCursorAgent({
    existingAgent:
      report.cursorAgentId && report.cursorAgentUrl
        ? { id: report.cursorAgentId, url: report.cursorAgentUrl }
        : null,
    existingIssue:
      report.linearIssueId && report.linearIssueUrl
        ? {
            id: report.linearIssueId,
            identifier: "",
            url: report.linearIssueUrl,
          }
        : null,
    fetchImpl: input.fetchImpl,
    integration: {
      cursorApiKey: secrets.cursorApiKey,
      githubRef: secrets.view.githubRef,
      githubRepoUrl: secrets.view.githubRepoUrl,
      launchCloudAgent: secrets.view.launchCloudAgent,
      linearApiKey: secrets.linearApiKey,
      linearLabelIds: secrets.view.linearLabelIds,
      linearProjectId: secrets.view.linearProjectId,
      linearTeamId: secrets.view.linearTeamId,
    },
    links: buildHandoffLinks({
      appBaseUrl: resolveWebhookAppBaseUrl(),
      reportId: report.id,
    }),
    markdown: context.markdown,
    reportId: report.id,
    reportTitle: report.title || context.title,
  })

  if (result.created) {
    await db
      .update(bugReport)
      .set({
        cursorAgentId: result.agent.id,
        cursorAgentUrl: result.agent.url,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bugReport.id, report.id),
          eq(bugReport.organizationId, report.organizationId)
        )
      )
  }

  await db
    .update(linearHandoffJob)
    .set({
      result: {
        agentId: result.agent.id,
        commented: result.commented,
        url: result.agent.url,
      },
      updatedAt: new Date(),
    })
    .where(eq(linearHandoffJob.id, input.claimed.id))
}
