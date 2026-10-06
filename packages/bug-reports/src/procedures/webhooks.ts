import { ORPCError } from "@orpc/server"
import { z } from "zod"
import {
  enqueueWebhookTestEvent,
  listWebhookDeliveries,
} from "../lib/webhooks/delivery"
import {
  disableOrganizationWebhookEndpoint,
  getOrganizationWebhookEndpoint,
  revealOrganizationWebhookSecret,
  rotateOrganizationWebhookSecret,
  upsertOrganizationWebhookEndpoint,
} from "../lib/webhooks/endpoint"
import { protectedProcedure } from "./context"
import { requireActiveOrgAdmin } from "./helpers"

const upsertWebhookEndpointInputSchema = z.object({
  enabled: z.boolean(),
  url: z.url().max(2048),
})

function rethrowWebhookError(error: unknown): never {
  if (error instanceof ORPCError) {
    throw error
  }

  const message = error instanceof Error ? error.message : null
  if (message) {
    throw new ORPCError("BAD_REQUEST", { message })
  }

  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: "Failed to process webhook request.",
  })
}

export const getWebhookSettings = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)
    const [endpoint, deliveries] = await Promise.all([
      getOrganizationWebhookEndpoint({ organizationId }),
      listWebhookDeliveries({ organizationId }),
    ])

    return {
      deliveries,
      endpoint,
    }
  }
)

export const upsertWebhookSettings = protectedProcedure
  .input(upsertWebhookEndpointInputSchema)
  .handler(async ({ context, input }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const endpoint = await upsertOrganizationWebhookEndpoint({
        createdBy: context.session.user.id,
        enabled: input.enabled,
        organizationId,
        url: input.url,
      })
      const deliveries = await listWebhookDeliveries({ organizationId })

      return {
        deliveries,
        endpoint,
      }
    } catch (error) {
      rethrowWebhookError(error)
    }
  })

export const rotateWebhookSecret = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const endpoint = await rotateOrganizationWebhookSecret({
        organizationId,
      })
      const deliveries = await listWebhookDeliveries({ organizationId })

      return {
        deliveries,
        endpoint,
      }
    } catch (error) {
      rethrowWebhookError(error)
    }
  }
)

export const revealWebhookSecret = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const endpoint = await revealOrganizationWebhookSecret({
        organizationId,
      })
      const deliveries = await listWebhookDeliveries({ organizationId })

      return {
        deliveries,
        endpoint,
      }
    } catch (error) {
      rethrowWebhookError(error)
    }
  }
)

export const disableWebhookSettings = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)
    const endpoint = await disableOrganizationWebhookEndpoint({
      organizationId,
    })
    const deliveries = await listWebhookDeliveries({ organizationId })

    return {
      deliveries,
      endpoint,
    }
  }
)

export const sendWebhookTestEvent = protectedProcedure.handler(
  async ({ context }) => {
    const organizationId = await requireActiveOrgAdmin(context.session)

    try {
      const delivery = await enqueueWebhookTestEvent({ organizationId })
      const [endpoint, deliveries] = await Promise.all([
        getOrganizationWebhookEndpoint({ organizationId }),
        listWebhookDeliveries({ organizationId }),
      ])

      return {
        delivery,
        deliveries,
        endpoint,
      }
    } catch (error) {
      rethrowWebhookError(error)
    }
  }
)
