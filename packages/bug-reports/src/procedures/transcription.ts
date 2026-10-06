import { ORPCError } from "@orpc/server"
import { z } from "zod"
import { TRANSCRIPTION_MODELS } from "../lib/transcription/constants"
import {
  getTranscriptForReport,
  retryBugReportTranscription,
} from "../lib/transcription/jobs"
import {
  getTranscriptionSettingsState,
  removeTranscriptionApiKey,
  testTranscriptionApiKey,
  upsertTranscriptionSettings,
} from "../lib/transcription/settings"
import { protectedProcedure } from "./context"
import { requireActiveOrgAdmin } from "./helpers"

const upsertTranscriptionSettingsInputSchema = z.object({
  apiKey: z.string().max(256).optional().nullable(),
  enabled: z.boolean(),
  language: z.string().max(16).optional().nullable(),
  model: z.enum(TRANSCRIPTION_MODELS),
  removeApiKey: z.boolean().optional(),
})

const testTranscriptionKeyInputSchema = z.object({
  apiKey: z.string().max(256).optional().nullable(),
  model: z.enum(TRANSCRIPTION_MODELS).optional(),
})

function rethrowTranscriptionError(error: unknown): never {
  if (error instanceof ORPCError) {
    throw error
  }

  const message = error instanceof Error ? error.message : null
  if (message) {
    throw new ORPCError("BAD_REQUEST", { message })
  }

  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Failed to process transcription settings.",
  })
}

export const getTranscriptionSettings = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)
    return getTranscriptionSettingsState({ organizationId })
  }
)

export const upsertTranscriptionSettingsProcedure = protectedProcedure
  .input(upsertTranscriptionSettingsInputSchema)
  .handler(async ({ context, input }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      return await upsertTranscriptionSettings({
        apiKey: input.apiKey,
        createdBy: context.session.user.id,
        enabled: input.enabled,
        language: input.language,
        model: input.model,
        organizationId,
        removeApiKey: input.removeApiKey,
      })
    } catch (error) {
      rethrowTranscriptionError(error)
    }
  })

export const removeTranscriptionApiKeyProcedure = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      return await removeTranscriptionApiKey({ organizationId })
    } catch (error) {
      rethrowTranscriptionError(error)
    }
  }
)

export const testTranscriptionKeyProcedure = protectedProcedure
  .input(testTranscriptionKeyInputSchema)
  .handler(async ({ context, input }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      return await testTranscriptionApiKey({
        apiKey: input.apiKey,
        model: input.model,
        organizationId,
      })
    } catch (error) {
      rethrowTranscriptionError(error)
    }
  })

export const retryBugReportTranscriptionProcedure = protectedProcedure
  .input(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, input }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const result = await retryBugReportTranscription({
        bugReportId: input.id,
        organizationId,
      })
      const transcript = await getTranscriptForReport({
        bugReportId: input.id,
        organizationId,
      })

      return {
        jobId: result.jobId,
        status: result.status,
        transcript,
      }
    } catch (error) {
      rethrowTranscriptionError(error)
    }
  })
