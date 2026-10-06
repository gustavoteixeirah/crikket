import { ORPCError } from "@orpc/server"
import { z } from "zod"
import {
  createLinearIssueForReportNow,
  launchCursorAgentForReportNow,
} from "../lib/linear/jobs"
import {
  getOrganizationLinearIntegration,
  listStoredLinearCatalog,
  testStoredCursorApiKey,
  testStoredLinearApiKey,
  upsertOrganizationLinearIntegration,
} from "../lib/linear/settings"
import { assertBugReportAccessById } from "../lib/utils"
import { protectedProcedure } from "./context"
import { requireActiveOrgAdmin, requireActiveOrgId } from "./helpers"

const upsertLinearIntegrationInputSchema = z.object({
  cursorApiKey: z.string().max(512).optional(),
  enabled: z.boolean(),
  githubRef: z.string().max(200).optional(),
  githubRepoUrl: z.string().max(500).optional(),
  launchCloudAgent: z.boolean(),
  linearApiKey: z.string().max(512).optional(),
  linearLabelIds: z.array(z.string().max(64)).max(20).optional(),
  linearLabelNames: z.array(z.string().max(80)).max(20).optional(),
  linearProjectId: z.string().max(64).nullable().optional(),
  linearProjectName: z.string().max(200).nullable().optional(),
  linearTeamId: z.string().max(64).nullable().optional(),
  linearTeamKey: z.string().max(40).nullable().optional(),
  linearTeamName: z.string().max(200).nullable().optional(),
})

const reportIdInputSchema = z.object({
  reportId: z.string().min(1),
})

function rethrowLinearError(error: unknown): never {
  if (error instanceof ORPCError) {
    throw error
  }

  const message = error instanceof Error ? error.message : null
  if (message) {
    throw new ORPCError("BAD_REQUEST", { message })
  }

  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Failed to process Linear integration request.",
  })
}

export const getLinearSettings = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)
    const integration = await getOrganizationLinearIntegration({
      organizationId,
    })

    return { integration }
  }
)

export const upsertLinearSettings = protectedProcedure
  .input(upsertLinearIntegrationInputSchema)
  .handler(async ({ context, input }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const integration = await upsertOrganizationLinearIntegration({
        createdBy: context.session.user.id,
        cursorApiKey: input.cursorApiKey,
        enabled: input.enabled,
        githubRef: input.githubRef,
        githubRepoUrl: input.githubRepoUrl,
        launchCloudAgent: input.launchCloudAgent,
        linearApiKey: input.linearApiKey,
        linearLabelIds: input.linearLabelIds,
        linearLabelNames: input.linearLabelNames,
        linearProjectId: input.linearProjectId,
        linearProjectName: input.linearProjectName,
        linearTeamId: input.linearTeamId,
        linearTeamKey: input.linearTeamKey,
        linearTeamName: input.linearTeamName,
        organizationId,
      })

      return { integration }
    } catch (error) {
      rethrowLinearError(error)
    }
  })

export const testLinearSettingsKey = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const result = await testStoredLinearApiKey({ organizationId })
      return result
    } catch (error) {
      rethrowLinearError(error)
    }
  }
)

export const testCursorSettingsKey = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const result = await testStoredCursorApiKey({ organizationId })
      return result
    } catch (error) {
      rethrowLinearError(error)
    }
  }
)

export const listLinearCatalogSettings = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const teams = await listStoredLinearCatalog({ organizationId })
      return { teams }
    } catch (error) {
      rethrowLinearError(error)
    }
  }
)

export const createLinearIssueForReport = protectedProcedure
  .input(reportIdInputSchema)
  .handler(async ({ context, input }) => {
    const organizationId = requireActiveOrgId(context.session)
    await assertBugReportAccessById({
      id: input.reportId,
      session: context.session,
    })

    try {
      return await createLinearIssueForReportNow({
        bugReportId: input.reportId,
        organizationId,
      })
    } catch (error) {
      rethrowLinearError(error)
    }
  })

export const launchCursorAgentForReport = protectedProcedure
  .input(reportIdInputSchema)
  .handler(async ({ context, input }) => {
    const organizationId = requireActiveOrgId(context.session)
    await assertBugReportAccessById({
      id: input.reportId,
      session: context.session,
    })

    try {
      return await launchCursorAgentForReportNow({
        bugReportId: input.reportId,
        organizationId,
      })
    } catch (error) {
      rethrowLinearError(error)
    }
  })
