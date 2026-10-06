import type { RouterClient } from "@orpc/server"

import { publicProcedure } from "../index"

import { authRouter } from "./auth"
import { billingRouter } from "./billing"
import { bugReportRouter } from "./bug-report"
import { captureKeyRouter } from "./capture-key"
import { organizationApiKeyRouter } from "./organization-api-key"
import { transcriptionRouter } from "./transcription"
import { webhookRouter } from "./webhook"

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK"
  }),
  auth: authRouter,
  billing: billingRouter,
  bugReport: bugReportRouter,
  captureKey: captureKeyRouter,
  organizationApiKey: organizationApiKeyRouter,
  transcription: transcriptionRouter,
  webhook: webhookRouter,
}
export type AppRouter = typeof appRouter
export type AppRouterClient = RouterClient<typeof appRouter>
