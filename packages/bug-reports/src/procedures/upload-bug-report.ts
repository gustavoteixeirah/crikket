import { resolveIngestOrganizationId } from "@crikket/auth/lib/active-organization"
import { listUserOrganizationMemberships } from "@crikket/auth/lib/organization-preference"
import { db } from "@crikket/db"
import { bugReport } from "@crikket/db/schema/bug-report"
import { ORPCError } from "@orpc/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { retryBugReportDebuggerIngestion } from "../lib/ingestion-jobs"
import {
  createBugReportUploadSession,
  createBugReportUploadSessionInputSchema,
  finalizeBugReportUpload,
  finalizeBugReportUploadInputSchema,
} from "../lib/upload-session"
import type { SessionContext } from "../lib/utils"
import { protectedProcedure } from "./context"
import { normalizeTags, requireActiveOrgId } from "./helpers"

const organizationIdInput = z.string().min(1)

const createBugReportUploadInputSchema =
  createBugReportUploadSessionInputSchema.extend({
    organizationId: organizationIdInput.optional(),
  })

const finalizeBugReportUploadProcedureInputSchema =
  finalizeBugReportUploadInputSchema.extend({
    organizationId: organizationIdInput.optional(),
  })

async function resolveUploadOrganizationId(input: {
  explicitOrganizationId?: string | null
  session: SessionContext
}): Promise<string> {
  const memberships = await listUserOrganizationMemberships(
    input.session.user.id
  )
  const resolved = resolveIngestOrganizationId({
    explicitOrganizationId: input.explicitOrganizationId,
    membershipOrganizationIds: memberships.map(
      (membership) => membership.organizationId
    ),
    sessionActiveOrganizationId: input.session.session.activeOrganizationId,
  })

  if (!resolved.ok) {
    if (resolved.code === "not_a_member") {
      throw new ORPCError("FORBIDDEN", {
        message: "You are not a member of the selected organization.",
      })
    }

    throw new ORPCError("BAD_REQUEST", {
      message: "No active organization. Choose an organization to submit to.",
    })
  }

  return resolved.organizationId
}

export const createBugReportUpload = protectedProcedure
  .input(createBugReportUploadInputSchema)
  .handler(async ({ context, input }) => {
    const { organizationId: explicitOrganizationId, ...uploadInput } = input
    const organizationId = await resolveUploadOrganizationId({
      explicitOrganizationId,
      session: context.session,
    })

    return createBugReportUploadSession({
      input: uploadInput,
      organizationId,
      reporterId: context.session.user.id,
      tags: normalizeTags(uploadInput.tags),
    })
  })

export const finalizeBugReportUploadProcedure = protectedProcedure
  .input(finalizeBugReportUploadProcedureInputSchema)
  .handler(async ({ context, input }) => {
    const { organizationId: explicitOrganizationId, ...finalizeInput } = input
    const organizationId = await resolveUploadOrganizationId({
      explicitOrganizationId,
      session: context.session,
    })

    return finalizeBugReportUpload({
      input: finalizeInput,
      organizationId,
    })
  })

export const retryBugReportDebuggerIngestionProcedure = protectedProcedure
  .input(
    z.object({
      id: z.string().min(1),
    })
  )
  .handler(async ({ context, input }) => {
    const activeOrgId = requireActiveOrgId(context.session)
    const result = await retryBugReportDebuggerIngestion({
      bugReportId: input.id,
      organizationId: activeOrgId,
    })

    const report = await db.query.bugReport.findFirst({
      where: and(
        eq(bugReport.id, input.id),
        eq(bugReport.organizationId, activeOrgId)
      ),
      columns: {
        debuggerIngestionError: true,
        debuggerIngestionStatus: true,
        id: true,
        submissionStatus: true,
      },
    })

    if (!report) {
      throw new ORPCError("NOT_FOUND", { message: "Bug report not found" })
    }

    return {
      debugger: result.debugger,
      debuggerIngestionError: report.debuggerIngestionError,
      debuggerIngestionStatus: report.debuggerIngestionStatus,
      id: report.id,
      submissionStatus: report.submissionStatus,
    }
  })
